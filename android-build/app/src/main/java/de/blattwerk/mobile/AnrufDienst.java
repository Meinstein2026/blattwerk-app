package de.blattwerk.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.IBinder;
import android.util.Log;
import android.webkit.CookieManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Klingeldienst für Festnetz-Anrufe (Stufe 2 der Telefonie, 2026-08-20).
 *
 * Die Web-App kann nur klingeln, solange sie offen ist — dieser Foreground-
 * Service hängt stattdessen dauerhaft am Klingelstrom des eigenen Servers
 * (/api/anruf/strom in server.mjs, dahinter das geheime ntfy-Topic des
 * Callbots) und zeigt bei „bw-klingeln" eine Anruf-Benachrichtigung mit
 * Klingelton und Vibration; „bw-ende" räumt sie wieder ab (angenommen,
 * aufgelegt oder Mailbox). Antippen öffnet die Telefon-Ansicht der App.
 *
 * Auth: derselbe Authentik-Session-Cookie wie die WebView (CookieManager ist
 * prozessweit). Läuft die Session ab, antwortet der Server mit einer
 * Umleitung/401 — der Dienst probiert es dann mit Abstand weiter und kommt
 * von selbst wieder rein, sobald die App einmal geöffnet (und damit der
 * Cookie erneuert) wurde.
 */
public class AnrufDienst extends Service {

    private static final String TAG = "BlattwerkAnruf";
    private static final String STROM_URL = BuildConfig.HOME_URL + "/api/anruf/strom";
    private static final String TELEFON_URL = BuildConfig.HOME_URL + "/#telefon";

    private static final String KANAL_BEREITSCHAFT = "bereitschaft";
    private static final String KANAL_ANRUFE = "anrufe";
    private static final int NOTIF_BEREITSCHAFT = 1;
    private static final int NOTIF_KLINGELN = 2;

    /** Marker aus callbot/ntfy.py — dort und hier identisch halten. */
    private static final String TAG_KLINGELN = "bw-klingeln";
    private static final String TAG_ENDE = "bw-ende";

    /** ntfy schickt alle ~45 s ein keepalive — bleibt der Strom länger still,
     *  ist die Verbindung tot und wird neu aufgebaut. */
    private static final int LESE_TIMEOUT_MS = 120_000;
    /** Wie lange die Anruf-Benachrichtigung höchstens stehen bleibt, falls das
     *  „Ende"-Ereignis verloren geht (Klingeldauer ist serverseitig 90 s). */
    private static final long KLINGEL_TIMEOUT_MS = 95_000;

    private volatile boolean laeuft = false;
    private Thread leser;

    @Override
    public void onCreate() {
        super.onCreate();
        kanaeleAnlegen();
        startForeground(NOTIF_BEREITSCHAFT, bereitschaftsNotiz());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (leser == null || !leser.isAlive()) {
            laeuft = true;
            leser = new Thread(this::stromLesen, "anruf-strom");
            leser.setDaemon(true);
            leser.start();
        }
        // Nach einem Abschuss durch das System neu starten — der Dienst IST
        // die Erreichbarkeit der Festnetznummer auf diesem Gerät.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        laeuft = false;
        if (leser != null) leser.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ---------- Stromleser ----------

    private void stromLesen() {
        long pauseMs = 5_000;
        while (laeuft) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(STROM_URL).openConnection();
                c.setConnectTimeout(15_000);
                c.setReadTimeout(LESE_TIMEOUT_MS);
                c.setInstanceFollowRedirects(false); // 302 = Authentik will Login, nicht folgen
                String cookie = CookieManager.getInstance().getCookie(STROM_URL);
                if (cookie != null) c.setRequestProperty("Cookie", cookie);
                int status = c.getResponseCode();
                if (status != 200) {
                    Log.w(TAG, "Klingelstrom: HTTP " + status + " (Session abgelaufen?)");
                } else {
                    pauseMs = 5_000; // verbunden — Rückzugszeit zurücksetzen
                    try (BufferedReader in = new BufferedReader(
                            new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                        String zeile;
                        while (laeuft && (zeile = in.readLine()) != null) {
                            zeileVerarbeiten(zeile);
                        }
                    }
                }
            } catch (Exception e) {
                if (laeuft) Log.w(TAG, "Klingelstrom getrennt: " + e.getMessage());
            } finally {
                if (c != null) c.disconnect();
            }
            if (!laeuft) return;
            try {
                Thread.sleep(pauseMs);
            } catch (InterruptedException e) {
                return;
            }
            pauseMs = Math.min(pauseMs * 2, 60_000);
        }
    }

    private void zeileVerarbeiten(String zeile) {
        try {
            JSONObject j = new JSONObject(zeile);
            if (!"message".equals(j.optString("event"))) return; // keepalive/open
            JSONArray tags = j.optJSONArray("tags");
            if (tags == null) return;
            for (int i = 0; i < tags.length(); i++) {
                String tag = tags.optString(i);
                if (TAG_KLINGELN.equals(tag)) {
                    klingeln(j.optString("title", "Ankommender Anruf"));
                    return;
                }
                if (TAG_ENDE.equals(tag)) {
                    klingelnBeenden();
                    return;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Klingelstrom: Zeile unlesbar: " + e.getMessage());
        }
    }

    // ---------- Benachrichtigungen ----------

    private void kanaeleAnlegen() {
        NotificationManager nm = getSystemService(NotificationManager.class);

        NotificationChannel bereit = new NotificationChannel(
                KANAL_BEREITSCHAFT, "Anrufbereitschaft", NotificationManager.IMPORTANCE_MIN);
        bereit.setDescription("Hält die Verbindung für eingehende Festnetz-Anrufe.");
        bereit.setShowBadge(false);
        nm.createNotificationChannel(bereit);

        NotificationChannel anrufe = new NotificationChannel(
                KANAL_ANRUFE, "Eingehende Anrufe", NotificationManager.IMPORTANCE_HIGH);
        anrufe.setDescription("Klingelt bei Anrufen auf der Festnetznummer.");
        anrufe.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        anrufe.enableVibration(true);
        anrufe.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
        nm.createNotificationChannel(anrufe);
    }

    private Notification bereitschaftsNotiz() {
        return new NotificationCompat.Builder(this, KANAL_BEREITSCHAFT)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Anrufbereitschaft aktiv")
                .setContentText("Wartet auf Anrufe der Festnetznummer.")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .build();
    }

    private PendingIntent telefonOeffnen() {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(TELEFON_URL), this, MainActivity.class);
        return PendingIntent.getActivity(this, 0, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void klingeln(String titel) {
        Notification n = new NotificationCompat.Builder(this, KANAL_ANRUFE)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(titel)
                .setContentText("Zum Annehmen antippen")
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setContentIntent(telefonOeffnen())
                // Volle Anzeige auch bei gesperrtem Bildschirm — wie ein Anruf.
                .setFullScreenIntent(telefonOeffnen(), true)
                .setTimeoutAfter(KLINGEL_TIMEOUT_MS)
                .build();
        // INSISTENT lässt den Klingelton in Schleife laufen, bis die
        // Benachrichtigung verschwindet (Ende-Ereignis oder Timeout).
        n.flags |= Notification.FLAG_INSISTENT;
        getSystemService(NotificationManager.class).notify(NOTIF_KLINGELN, n);
    }

    private void klingelnBeenden() {
        getSystemService(NotificationManager.class).cancel(NOTIF_KLINGELN);
    }
}
