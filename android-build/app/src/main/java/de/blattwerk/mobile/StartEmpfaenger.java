package de.blattwerk.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/**
 * Startet den Klingeldienst nach jedem Geräte-Neustart — sonst wäre die
 * Festnetznummer nach einem Reboot unhörbar, bis jemand die App öffnet.
 */
public class StartEmpfaenger extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        ContextCompat.startForegroundService(context, new Intent(context, AnrufDienst.class));
    }
}
