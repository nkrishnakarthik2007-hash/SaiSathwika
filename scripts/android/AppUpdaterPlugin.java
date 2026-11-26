package __APP_PACKAGE__;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipFile;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String TAG = "SaiSathwikaUpdater";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        String expectedSha256 = call.getString("sha256", "");

        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("The update download URL is missing.");
            return;
        }

        Uri parsed = Uri.parse(downloadUrl);
        if (!"https".equalsIgnoreCase(parsed.getScheme()) || !"github.com".equalsIgnoreCase(parsed.getHost())) {
            call.reject("For safety, updates can only be downloaded from the official Sai Sathwika GitHub release.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(settings);
            call.reject("INSTALL_PERMISSION_REQUIRED: Allow Sai Sathwika to install updates, return to the app, then tap Update again.");
            return;
        }

        worker.execute(() -> downloadAndStage(call, downloadUrl, expectedSha256));
    }

    private void downloadAndStage(PluginCall call, String downloadUrl, String expectedSha256) {
        HttpURLConnection connection = null;
        File partialFile = null;
        try {
            File downloadDirectory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadDirectory == null) {
                throw new Exception("Android could not prepare app storage for the update.");
            }
            if (!downloadDirectory.exists() && !downloadDirectory.mkdirs()) {
                throw new Exception("Android could not create the update download folder.");
            }

            partialFile = new File(downloadDirectory, "SaiSathwika-update.apk.part");
            File apkFile = new File(downloadDirectory, "SaiSathwika-update.apk");
            if (partialFile.exists()) partialFile.delete();

            URL url = new URL(downloadUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(25000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "SaiSathwika-Android-Updater");
            connection.connect();

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new Exception("GitHub returned download status " + status + ".");
            }

            long totalBytes = connection.getContentLengthLong();
            if (totalBytes > 100L * 1024L * 1024L) {
                throw new Exception("The update file is unexpectedly large. Download cancelled.");
            }

            long received = 0;
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 OutputStream output = new FileOutputStream(partialFile)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    received += count;
                    if (received > 100L * 1024L * 1024L) {
                        throw new Exception("The update file exceeded the 100 MB safety limit.");
                    }
                    output.write(buffer, 0, count);
                    JSObject progress = new JSObject();
                    progress.put("receivedBytes", received);
                    progress.put("totalBytes", totalBytes);
                    progress.put("percent", totalBytes > 0 ? Math.min(100, (int) ((received * 100L) / totalBytes)) : 0);
                    notifyListeners("downloadProgress", progress);
                }
                output.flush();
            }

            if (received < 1024L * 1024L) {
                throw new Exception("The downloaded file is too small to be a valid Android update.");
            }

            String actualSha256 = sha256(partialFile);
            if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
                String expected = expectedSha256.replace("sha256:", "").trim().toLowerCase(Locale.US);
                if (!actualSha256.equals(expected)) {
                    throw new Exception("The downloaded update failed its SHA-256 integrity check. Nothing was installed.");
                }
            }

            try (ZipFile zip = new ZipFile(partialFile)) {
                if (zip.getEntry("AndroidManifest.xml") == null) {
                    throw new Exception("GitHub's file is not a valid Android APK.");
                }
            }

            PackageManager packageManager = getContext().getPackageManager();
            PackageInfo downloadedInfo = packageManager.getPackageArchiveInfo(partialFile.getAbsolutePath(), 0);
            if (downloadedInfo == null || !getContext().getPackageName().equals(downloadedInfo.packageName)) {
                throw new Exception("This APK does not belong to the installed Sai Sathwika app.");
            }

            PackageInfo installedInfo = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            long downloadedVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? downloadedInfo.getLongVersionCode() : downloadedInfo.versionCode;
            long installedVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? installedInfo.getLongVersionCode() : installedInfo.versionCode;
            if (downloadedVersion <= installedVersion) {
                throw new Exception("This update is not newer than the installed app.");
            }

            if (apkFile.exists() && !apkFile.delete()) {
                throw new Exception("Android could not replace the previous update file.");
            }
            if (!partialFile.renameTo(apkFile)) {
                throw new Exception("Android could not finish saving the update file.");
            }

            getActivity().runOnUiThread(() -> stageInstall(call, apkFile, downloadedVersion, actualSha256));
        } catch (Exception error) {
            Log.e(TAG, "Update download failed", error);
            if (partialFile != null && partialFile.exists()) partialFile.delete();
            rejectOnMainThread(call, "Update download failed: " + error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void stageInstall(PluginCall call, File apkFile, long versionCode, String sha256) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(settings);
                call.reject("INSTALL_PERMISSION_REQUIRED: Allow Sai Sathwika to install updates, return to the app, then tap Update again.");
                return;
            }

            PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(getContext().getPackageName());

            int sessionId = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(sessionId);
            try (InputStream input = new FileInputStream(apkFile);
                 OutputStream output = session.openWrite("SaiSathwika.apk", 0, apkFile.length())) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                session.fsync(output);
            }

            Intent statusIntent = new Intent(getContext(), UpdateInstallReceiver.class);
            statusIntent.setAction(getContext().getPackageName() + ".UPDATE_INSTALL_STATUS");
            int pendingFlags = PendingIntentFlags.mutableUpdateCurrent();
            android.app.PendingIntent statusPendingIntent = android.app.PendingIntent.getBroadcast(
                    getContext(), sessionId, statusIntent, pendingFlags
            );
            session.commit(statusPendingIntent.getIntentSender());
            session.close();

            JSObject result = new JSObject();
            result.put("downloaded", true);
            result.put("installerStarted", true);
            result.put("versionCode", versionCode);
            result.put("sha256", sha256);
            call.resolve(result);
        } catch (Exception error) {
            Log.e(TAG, "Could not start Android package installer", error);
            call.reject("The APK downloaded, but Android could not open the installer: " + error.getMessage());
        }
    }

    private void rejectOnMainThread(PluginCall call, String message) {
        if (getActivity() != null) getActivity().runOnUiThread(() -> call.reject(message));
        else call.reject(message);
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(Locale.US, "%02x", value & 0xff));
        return hex.toString();
    }

    private static final class PendingIntentFlags {
        static int mutableUpdateCurrent() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                return android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE;
            }
            return android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        }
    }
}
