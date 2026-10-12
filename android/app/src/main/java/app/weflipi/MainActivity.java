package app.weflipi;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * weflipi for Android: a full-screen WebView on https://flipii.vercel.app. The game itself lives on
 * the web, so every update reaches the app without reinstalling. Links to other sites open in the
 * browser, and the page can open Android's share sheet through window.WeflipiAndroid.share().
 */
public class MainActivity extends Activity {
    private static final String HOST = "flipii.vercel.app";
    private static final String HOME = "https://" + HOST + "/?app=android";
    private static final int BG = 0xFF14112E;

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " weflipi-android/1.0");

        web.addJavascriptInterface(new Bridge(), "WeflipiAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                openOutside(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(startUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null) web.loadUrl(startUrl(intent));
    }

    /** An invite link that opened the app goes straight to that page; anything else to home. */
    private static String startUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        return data != null && HOST.equals(data.getHost()) ? data.toString() : HOME;
    }

    private void openOutside(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException ignored) {
            // Nothing can open it: stay in the app.
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** Exposed to the page as window.WeflipiAndroid. */
    private class Bridge {
        @JavascriptInterface
        public void share(String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, "Compartir weflipi")));
        }
    }

    private static final String OFFLINE_PAGE =
        "<html><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#14112e;color:#fff7e8;"
            + "font-family:sans-serif;text-align:center\"><div><div style=\"font:italic 800 44px sans-serif\">we"
            + "<span style=\"color:#ffd35c\">flipi</span></div><p>Sin conexión. Revisa tu internet.</p>"
            + "<button onclick=\"location.href='" + HOME + "'\" style=\"font:700 18px sans-serif;padding:12px 22px;"
            + "border-radius:14px;border:3px solid #1b1838;background:#ffd35c\">Reintentar</button></div></body></html>";
}
