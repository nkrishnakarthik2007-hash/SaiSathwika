package __APP_PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.util.Log;

public class UpdateInstallReceiver extends BroadcastReceiver {
    private static final String TAG = "SaiSathwikaUpdater";

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                confirmation = (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (confirmation != null) {
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmation);
            } else {
                Log.e(TAG, "Android requested install confirmation but supplied no confirmation screen.");
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            Log.i(TAG, "Android successfully installed the Sai Sathwika update.");
        } else {
            Log.e(TAG, "Android installer failed with status " + status + ": " + message);
        }
    }
}
