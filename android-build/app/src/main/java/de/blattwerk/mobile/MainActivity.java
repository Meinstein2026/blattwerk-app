package de.blattwerk.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;

/**
 * WebView-Wrapper für die Blattwerk-App.
 *
 * Wichtig: Die App liegt hinter Authentik-Forward-Auth. Der komplette
 * Redirect-Tanz (App-Host -> Auth-Host -> zurück) MUSS in dieser
 * WebView bleiben, sonst landet der Session-Cookie im falschen Browser
 * (Lektion aus der Bahn-App). Deshalb bleiben die eigenen Domains
 * (BuildConfig.HOME_URL/HOME_DOMAINS, aus local.properties, siehe
 * app/build.gradle — nie im Quelltext) intern; nur fremde Hosts gehen an
 * den System-Browser.
 */
public class MainActivity extends Activity {

    private static final String START_URL = BuildConfig.HOME_URL;

    /**
     * Eigene Domains — was hier drinsteht, bleibt im WebView; alles andere geht
     * an den System-Browser.
     *
     * Kommaliste aus BuildConfig.HOME_DOMAINS (local.properties BW_HOME_DOMAINS).
     * Nach einem Domain-Umzug gehören ALTE und NEUE Domain gleichzeitig hinein,
     * solange die uebrigen Dienste noch unter beiden Namen erreichbar sind:
     * faengt der Anmelde-Umweg unter dem alten Namen an und die Domain gilt
     * nicht als eigene, landet man mitten im Login im Browser und kommt nie
     * zurueck. Raus darf die alte erst, wenn daraus Weiterleitungen geworden
     * sind.
     */
    private static final String[] HOME_DOMAINS = BuildConfig.HOME_DOMAINS.split(",");

    /** Gehoert der Host zu einer der eigenen Domains? */
    private static boolean istEigeneDomain(String host) {
        if (host == null) return false;
        for (String d : HOME_DOMAINS) {
            if (host.equals(d) || host.endsWith("." + d)) return true;
        }
        return false;
    }
    private static final int RC_CAMERA = 1;
    private static final int RC_FILE = 2;
    private static final int RC_NOTIF = 3;
    private static final java.util.regex.Pattern SAFE_FRAGMENT =
            java.util.regex.Pattern.compile("[A-Za-z0-9_-]{1,32}");

    /** Nach so langer Zeit wird der Splash auf jeden Fall freigegeben — ein
     *  hängendes Netz darf nicht in einem endlosen Startbildschirm enden. */
    private static final long SPLASH_MAX_MS = 6000;

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private volatile boolean pageLoaded = false;
    private long startedAt;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Startbildschirm wie in der Element-X-Fork: Markenfläche + Icon, bleibt
        // stehen, solange die WebView noch lädt (inkl. Authentik-Redirect), und
        // blendet danach weich aus statt hart umzuschalten.
        startedAt = SystemClock.elapsedRealtime();
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() ->
                !pageLoaded && SystemClock.elapsedRealtime() - startedAt < SPLASH_MAX_MS);
        splash.setOnExitAnimationListener(provider -> {
            View v = provider.getView();
            AnimatorSet set = new AnimatorSet();
            set.playTogether(
                    ObjectAnimator.ofFloat(v, View.ALPHA, 1f, 0f),
                    ObjectAnimator.ofFloat(v, View.SCALE_X, 1f, 1.08f),
                    ObjectAnimator.ofFloat(v, View.SCALE_Y, 1f, 1.08f));
            set.setDuration(320);
            set.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator a) { provider.remove(); }
            });
            set.start();
        });

        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFFFFFFF);
        // Diagnose nur in Debug-Builds: chrome://inspect erreicht die WebView
        // ohnehin nur über autorisiertes USB-adb, aber im Release bleibt der
        // Schalter aus (Sicherheits-Befund vom 20.08.2026, APK 1.5 hatte ihn an).
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Klingeldienst (Stufe 2 der Telefonie): läuft ab jetzt dauerhaft, auch
        // wenn die App geschlossen wird — sonst bliebe die Festnetznummer stumm.
        klingeldienstStarten();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        // Kamera-Vorschau (Beleg-Scanner) startet ohne Nutzer-Geste
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;   // gibt den Splash frei
            }
        });

        // Update-Brücke: nur für die eigene Domain-Familie relevant, und die
        // WebView navigiert ohnehin nur dorthin (handleUrl schickt fremde Hosts
        // an den System-Browser).
        webView.addJavascriptInterface(new UpdateBridge(), "BlattwerkNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d("BlattwerkJS", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }

            /**
             * getUserMedia: Kamera (Beleg-Scanner) und Mikrofon (Festnetz-Anrufe im
             * Chat-Tab) — beides nur für die eigene Domain freigeben.
             */
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                String host = request.getOrigin() != null ? request.getOrigin().getHost() : null;
                boolean ownOrigin = istEigeneDomain(host);
                String[] av = avRessourcen(request);
                if (!ownOrigin || av.length == 0) {
                    request.deny();
                    return;
                }
                List<String> fehlend = new ArrayList<>();
                for (String ressource : av) {
                    String recht = androidRecht(ressource);
                    if (checkSelfPermission(recht) != PackageManager.PERMISSION_GRANTED
                            && !fehlend.contains(recht)) {
                        fehlend.add(recht);
                    }
                }
                if (fehlend.isEmpty()) {
                    request.grant(av);
                } else {
                    pendingPermissionRequest = request;
                    requestPermissions(fehlend.toArray(new String[0]), RC_CAMERA);
                }
            }

            /** <input type="file">: Galerie/Dateien + (wenn erlaubt) direkte Kamera-Aufnahme. */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                cameraOutputUri = null;

                Intent content = params.createIntent();
                List<Intent> extraIntents = new ArrayList<>();
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    try {
                        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "");
                        if (!dir.exists()) dir.mkdirs();
                        File photo = new File(dir, "beleg-" + System.currentTimeMillis() + ".jpg");
                        cameraOutputUri = FileProvider.getUriForFile(
                                MainActivity.this, "de.blattwerk.mobile.fileprovider", photo);
                        Intent capture = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                        capture.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                        extraIntents.add(capture);
                    } catch (Exception e) {
                        Log.e("Blattwerk", "Kamera-Intent: " + e.getMessage());
                    }
                }

                Intent chooser = Intent.createChooser(content, "Datei wählen");
                if (!extraIntents.isEmpty()) {
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toArray(new Intent[0]));
                }
                try {
                    startActivityForResult(chooser, RC_FILE);
                } catch (Exception e) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Beleg-/PDF-Downloads über den System-Download-Manager (mit Session-Cookie)
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!url.startsWith("http")) return;
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) r.addRequestHeader("Cookie", cookie);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                        URLUtil.guessFileName(url, contentDisposition, mimeType));
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            } catch (Exception e) {
                Log.e("Blattwerk", "Download: " + e.getMessage());
            }
        });

        webView.loadUrl(startUrlFor(getIntent()));
        setContentView(webView);
    }

    /**
     * Kaltstart über einen Link (Matrix-Raum „Blattwerk Belege"): direkt dorthin,
     * sonst auf die Startseite. Fremde Hosts werden ignoriert — die WebView hält
     * den Authentik-Cookie und darf nicht auf beliebige Ziele gelenkt werden.
     */
    private String startUrlFor(Intent intent) {
        Uri uri = intent != null ? intent.getData() : null;
        return isOwnUrl(uri) ? uri.toString() : START_URL;
    }

    /**
     * Link angetippt, während die App schon läuft (launchMode singleTask): die
     * WebView lädt bei reinem Fragment-Wechsel NICHT neu, deshalb den Hash aktiv
     * setzen — die App horcht auf hashchange.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = intent != null ? intent.getData() : null;
        if (!isOwnUrl(uri) || webView == null) return;

        String current = webView.getUrl();
        String fragment = uri.getFragment();
        boolean sameDocument = current != null
                && stripFragment(current).equals(stripFragment(uri.toString()));
        // Fragment kommt von außen -> nur harmlose Bezeichner ins evaluateJavascript
        if (sameDocument && fragment != null && SAFE_FRAGMENT.matcher(fragment).matches()) {
            webView.evaluateJavascript(
                    "location.hash='';location.hash='" + fragment + "';", null);
        } else {
            webView.loadUrl(uri.toString());
        }
    }

    private static boolean isOwnUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return false;
        String host = uri.getHost();
        return istEigeneDomain(host);
    }

    private static String stripFragment(String url) {
        int i = url.indexOf('#');
        return i < 0 ? url : url.substring(0, i);
    }

    /**
     * Startet den Klingeldienst und holt die dafür nötigen Rechte nach:
     * POST_NOTIFICATIONS (ab Android 13 Laufzeit-Recht — ohne bleibt jedes
     * Klingeln unsichtbar UND unhörbar) und einmalig die Ausnahme von der
     * Akku-Optimierung (sonst kappt Doze die Verbindung und das Klingeln
     * kommt erst Minuten später an). Der Akku-Dialog kommt bewusst nur ein
     * einziges Mal — wer ihn ablehnt, soll nicht bei jedem Start genervt
     * werden (nachholbar in den Android-Einstellungen).
     */
    private void klingeldienstStarten() {
        try {
            startForegroundService(new Intent(this, AnrufDienst.class));
        } catch (Exception e) {
            Log.e("Blattwerk", "Klingeldienst: " + e.getMessage());
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, RC_NOTIF);
            return; // Akku-Dialog nicht gleichzeitig — ein Dialog nach dem anderen
        }
        akkuAusnahmeAnbieten();
    }

    private void akkuAusnahmeAnbieten() {
        try {
            android.os.PowerManager pm = getSystemService(android.os.PowerManager.class);
            android.content.SharedPreferences prefs = getSharedPreferences("anruf", MODE_PRIVATE);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())
                    || prefs.getBoolean("akkuGefragt", false)) {
                return;
            }
            prefs.edit().putBoolean("akkuGefragt", true).apply();
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            Log.e("Blattwerk", "Akku-Ausnahme: " + e.getMessage());
        }
    }

    /** Eigene Domain-Familie bleibt in der WebView, alles andere geht nach draußen. */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = uri.getHost();
            if (istEigeneDomain(host)) {
                return false;
            }
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Log.e("Blattwerk", "handleUrl: " + e.getMessage());
        }
        return true;
    }

    /**
     * Selbst-Update über den internen Update-Host (nginx `apps-static`,
     * wie bei der Kalender-App). Die Web-App
     * liest das manifest.json selbst per fetch — nativ nötig ist nur das
     * Herunterladen der APK und die Übergabe an den Paket-Installer.
     */
    public class UpdateBridge {

        @JavascriptInterface
        public String appVersion() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                JSONObject j = new JSONObject();
                j.put("versionCode", code);
                j.put("versionName", pi.versionName);
                return j.toString();
            } catch (Exception e) {
                return "{\"versionCode\":0,\"versionName\":\"?\"}";
            }
        }

        @JavascriptInterface
        public void downloadAndInstall(final String url) {
            io.execute(() -> {
                HttpURLConnection c = null;
                try {
                    URL u = new URL(url);
                    // Nur der eigene Update-Host darf eine APK liefern — sonst
                    // könnte eine untergeschobene Seite beliebige Pakete
                    // installieren lassen.
                    String host = u.getHost();
                    if (!istEigeneDomain(host)) {
                        updateFailed("Update-Adresse gehört nicht zum Homelab");
                        return;
                    }
                    File dir = new File(getCacheDir(), "updates");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("Ablage nicht anlegbar");
                    File apk = new File(dir, "update.apk");

                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    int status = c.getResponseCode();
                    if (status != 200) {
                        updateFailed("HTTP " + status
                                + (status == 403 ? " (nur über LAN oder NetBird erreichbar)" : ""));
                        return;
                    }
                    long total = c.getContentLengthLong();
                    try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                        byte[] buf = new byte[64 * 1024];
                        long done = 0;
                        int lastPct = -1, n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            if (total > 0) {
                                int pct = (int) (done * 100 / total);
                                if (pct >= lastPct + 5) { lastPct = pct; updateProgress(pct); }
                            }
                        }
                    }
                    if (apk.length() < 1024) throw new Exception("Download unvollständig");
                    startInstall(apk);
                } catch (Exception e) {
                    updateFailed(String.valueOf(e.getMessage()));
                } finally {
                    if (c != null) c.disconnect();
                }
            });
        }
    }

    /** Übergibt die geladene APK dem Paket-Installer; fehlt die Erlaubnis, führt der Nutzer sie einmalig nach. */
    private void startInstall(File apk) {
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    updateFailed("Bitte einmalig „Unbekannte Apps installieren“ erlauben");
                    Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName()));
                    perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(perm);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                jsCall("window.__updateReady && window.__updateReady();");
            } catch (Exception e) {
                Log.e("Blattwerk", "startInstall: " + e.getMessage());
                updateFailed(String.valueOf(e.getMessage()));
            }
        });
    }

    private void updateProgress(int pct) {
        jsCall("window.__updateProgress && window.__updateProgress(" + pct + ");");
    }

    private void updateFailed(String msg) {
        jsCall("window.__updateFailed && window.__updateFailed(" + JSONObject.quote(msg == null ? "" : msg) + ");");
    }

    private void jsCall(final String js) {
        runOnUiThread(() -> { if (webView != null) webView.evaluateJavascript(js, null); });
    }

    /** Die angefragten AV-Ressourcen — andere Typen gibt die Hülle grundsätzlich nicht frei. */
    private static String[] avRessourcen(PermissionRequest request) {
        List<String> av = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)
                    || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                av.add(r);
            }
        }
        return av.toArray(new String[0]);
    }

    private static String androidRecht(String ressource) {
        return PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(ressource)
                ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == RC_NOTIF) {
            // Egal wie die Antwort ausfiel: jetzt kommt (höchstens einmal) der
            // Akku-Dialog dran — die beiden sollten nicht gleichzeitig aufgehen.
            akkuAusnahmeAnbieten();
            return;
        }
        if (requestCode != RC_CAMERA || pendingPermissionRequest == null) return;
        // Nur freigeben, was Android jetzt tatsächlich bewilligt hat — plus das,
        // was schon vorher bewilligt war (z. B. Kamera erlaubt, Mikro eben erst
        // erfragt). Ein Teil-Grant ist für die WebView in Ordnung.
        List<String> gewaehrt = new ArrayList<>();
        for (String ressource : avRessourcen(pendingPermissionRequest)) {
            if (checkSelfPermission(androidRecht(ressource)) == PackageManager.PERMISSION_GRANTED) {
                gewaehrt.add(ressource);
            }
        }
        if (gewaehrt.isEmpty()) {
            pendingPermissionRequest.deny();
        } else {
            pendingPermissionRequest.grant(gewaehrt.toArray(new String[0]));
        }
        pendingPermissionRequest = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != RC_FILE || filePathCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && (data.getData() != null || data.getClipData() != null)) {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            } else if (cameraOutputUri != null) {
                // Kamera-Aufnahme: Intent kommt ohne Daten zurück, Bild liegt unter EXTRA_OUTPUT
                result = new Uri[]{cameraOutputUri};
            }
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        cameraOutputUri = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
