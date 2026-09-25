// Die APK 1.7 kannte nur EINE Domain-Familie und lehnte nach einem Domain-
// Umzug jede Installation von der neuen Update-Adresse mit "Update-Adresse
// gehoert nicht zum Homelab" ab — die App konnte sich selbst nicht mehr
// aktualisieren (Geraet 12.09.2026). Seit 1.8 kommen die eigenen Domains
// als Kommaliste aus BuildConfig.HOME_DOMAINS (lokal aus local.properties
// BW_HOME_DOMAINS, siehe app/build.gradle — nie als Literal im Quelltext),
// damit ein Umzug BEIDE Namen (alt + neu) gleichzeitig eintragen kann, ohne
// den Quelltext zu aendern. Prueft eine Stelle den Host wieder selbst statt
// ueber istEigeneDomain, sperrt sich die Huelle beim naechsten Umzug erneut
// aus. Deshalb dieser Waechter.
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const QUELLE = fs.readFileSync(
  "android-build/app/src/main/java/de/blattwerk/mobile/MainActivity.java", "utf8");
const MANIFEST = fs.readFileSync(
  "android-build/app/src/main/AndroidManifest.xml", "utf8");
const GRADLE = fs.readFileSync("android-build/app/build.gradle", "utf8");

describe("Eigene Domains der APK-Huelle", () => {
  it("HOME_DOMAINS kommt aus BuildConfig, nicht als Literal im Quelltext", () => {
    expect(QUELLE).toMatch(/HOME_DOMAINS\s*=\s*BuildConfig\.HOME_DOMAINS\.split\(/);
    expect(QUELLE).not.toMatch(/HOME_DOMAINS\s*=\s*\{\s*"/);
  });

  it("App-Link-Intent-Filter nutzt Manifest-Platzhalter, keine echten Hosts", () => {
    expect(MANIFEST).toMatch(/android:host="\$\{bwPrimaryHost\}"/);
    expect(MANIFEST).toMatch(/android:host="\$\{bwAltHost\}"/);
  });

  it("build.gradle setzt die Platzhalter aus local.properties/ENV mit Beispiel-Fallback", () => {
    expect(GRADLE).toMatch(/BW_HOME_URL/);
    expect(GRADLE).toMatch(/BW_HOME_DOMAINS/);
    expect(GRADLE).toMatch(/BW_ALT_HOST/);
    expect(GRADLE).toMatch(/manifestPlaceholders\s*=\s*\[bwPrimaryHost:/);
  });

  it("prueft jeden Host ueber istEigeneDomain (WebView, Kamera, APK-Download)", () => {
    // Aufrufe ohne die Definition selbst: WebView intern/extern, getUserMedia,
    // APK-Download.
    const aufrufe = (QUELLE.match(/istEigeneDomain\(/g) || []).length - 1;
    expect(aufrufe).toBeGreaterThanOrEqual(4);
    expect(QUELLE).not.toMatch(/HOME_DOMAIN\b(?!S)/);
  });
});
