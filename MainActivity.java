package sd.matjarak.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * متجرك 🇸🇩 — تطبيق Android (WebView) يفتح المنصة الحية.
 * - يحفظ عنوان الخادم (قابل للتعديل من داخل التطبيق).
 * - يدعم الكوكيز (جلسات الدخول)، RTL، زر الرجوع، شاشة انقطاع الإنترنت.
 * - يفتح روابط واتساب/ماسنجر/الهاتف/البريد في تطبيقاتها الأصلية.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "matjarak_prefs";
    private static final String KEY_BASE_URL = "base_url";

    private WebView webView;
    private ProgressBar progress;
    private LinearLayout offlineView;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        baseUrl = prefs.getString(KEY_BASE_URL, getString(R.string.default_base_url));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(webView);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 8);
        pl.gravity = Gravity.TOP;
        progress.setLayoutParams(pl);
        progress.setMax(100);
        root.addView(progress);

        offlineView = buildOfflineView();
        offlineView.setVisibility(View.GONE);
        root.addView(offlineView);

        setContentView(root);
        setupWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadHome();
        }
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MatjarakApp/1.0 (Android)");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternal(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternal(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showOffline();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (isOnline()) offlineView.setVisibility(View.GONE);
            }
        });
    }

    /** يفتح واتساب/ماسنجر/الهاتف/البريد/الروابط الخارجية في التطبيقات الأصلية */
    private boolean handleExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        boolean isExternalApp =
                scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("whatsapp")
                        || scheme.equals("sms") || scheme.equals("intent")
                        || host.contains("wa.me") || host.contains("whatsapp.com")
                        || host.contains("m.me") || host.contains("messenger.com");
        if (isExternalApp) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }
        return false; // stay in WebView for platform pages
    }

    private void loadHome() {
        if (!isOnline()) {
            showOffline();
            return;
        }
        offlineView.setVisibility(View.GONE);
        webView.loadUrl(baseUrl);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }

    private void showOffline() {
        offlineView.setVisibility(View.VISIBLE);
    }

    private LinearLayout buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        box.setPadding(48, 48, 48, 48);

        TextView icon = new TextView(this);
        icon.setText("🛒");
        icon.setTextSize(56);
        icon.setGravity(Gravity.CENTER);
        box.addView(icon);

        TextView title = new TextView(this);
        title.setText("متجرك");
        title.setTextSize(28);
        title.setTextColor(Color.parseColor("#1F3F8F"));
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 16, 0, 4);
        box.addView(title);

        TextView sub = new TextView(this);
        sub.setText("سهولة التسوق في تطبيقك");
        sub.setTextSize(14);
        sub.setTextColor(Color.parseColor("#64748B"));
        sub.setGravity(Gravity.CENTER);
        box.addView(sub);

        TextView msg = new TextView(this);
        msg.setText("لا يوجد اتصال بالإنترنت أو تعذر الوصول إلى الخادم.\nتحقق من الشبكة ثم أعد المحاولة.");
        msg.setTextSize(15);
        msg.setTextColor(Color.parseColor("#334155"));
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, 40, 0, 24);
        box.addView(msg);

        Button retry = new Button(this);
        retry.setText("🔄 إعادة المحاولة");
        retry.setOnClickListener(v -> loadHome());
        box.addView(retry);

        Button settings = new Button(this);
        settings.setText("⚙️ تغيير عنوان الخادم");
        settings.setOnClickListener(v -> promptBaseUrl());
        box.addView(settings);

        TextView current = new TextView(this);
        current.setText(baseUrl);
        current.setTextSize(11);
        current.setTextColor(Color.parseColor("#94A3B8"));
        current.setGravity(Gravity.CENTER);
        current.setPadding(0, 16, 0, 0);
        box.addView(current);

        return box;
    }

    /** حوار لتغيير عنوان الخادم (مثلاً عند نشر المنصة على دومين جديد) */
    private void promptBaseUrl() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(baseUrl);
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        new AlertDialog.Builder(this)
                .setTitle("عنوان خادم متجرك")
                .setMessage("أدخل رابط المنصة (يبدأ بـ https://)")
                .setView(input)
                .setPositiveButton("حفظ", (d, w) -> {
                    String v = input.getText().toString().trim();
                    if (v.startsWith("http://") || v.startsWith("https://")) {
                        baseUrl = v;
                        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                .edit().putString(KEY_BASE_URL, v).apply();
                        recreate();
                    }
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
