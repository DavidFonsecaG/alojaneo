/**
 * Alojaneo booking engine — embed loader.
 *
 * A hotel drops one <script> on their site; this injects the booking engine in
 * an iframe (full CSS/JS isolation from their page). Two modes:
 *
 *   inline  — the engine renders in the page flow where the script sits, and
 *             auto-resizes to its content (no inner scrollbar).
 *   button  — renders a "Book now" button that opens the engine in a modal.
 *
 * Usage:
 *   <script src="https://book.alojaneo.com/embed.js"
 *           data-hotel="hotel-demo"
 *           data-mode="inline"          <!-- inline (default) | button -->
 *           data-checkin="2026-09-20"   <!-- optional deep-link prefill -->
 *           data-checkout="2026-09-22"
 *           data-guests="2"
 *           data-button-text="Book now"
 *           data-button-color="#171717"></script>
 *
 * The iframe origin is taken from this script's own src, so the snippet always
 * points at wherever embed.js is hosted.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    console.error("[alojaneo] embed.js: could not resolve script origin");
    return;
  }

  var cfg = {
    hotel: script.getAttribute("data-hotel") || "",
    mode: script.getAttribute("data-mode") || "inline",
    checkin: script.getAttribute("data-checkin") || "",
    checkout: script.getAttribute("data-checkout") || "",
    guests: script.getAttribute("data-guests") || "",
    buttonText: script.getAttribute("data-button-text") || "Book now",
    buttonColor: script.getAttribute("data-button-color") || "#171717",
    minHeight: parseInt(script.getAttribute("data-min-height") || "600", 10),
  };

  if (!cfg.hotel) {
    console.error("[alojaneo] embed.js: missing required data-hotel attribute");
    return;
  }

  function buildSrc() {
    var params = new URLSearchParams({ embed: "1" });
    if (cfg.checkin) params.set("checkin", cfg.checkin);
    if (cfg.checkout) params.set("checkout", cfg.checkout);
    if (cfg.guests) params.set("guests", cfg.guests);
    return (
      origin + "/" + encodeURIComponent(cfg.hotel) + "?" + params.toString()
    );
  }

  function makeIframe() {
    var iframe = document.createElement("iframe");
    iframe.src = buildSrc();
    iframe.title = "Booking";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allow", "payment");
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    return iframe;
  }

  // Grow/shrink an inline iframe to match the engine's content height, using
  // the resize messages the engine posts (scoped to this iframe + our origin).
  function attachAutoResize(iframe) {
    iframe.style.height = cfg.minHeight + "px";
    window.addEventListener("message", function (e) {
      if (e.origin !== origin) return;
      if (!e.data || e.data.type !== "alojaneo:resize") return;
      if (e.source !== iframe.contentWindow) return;
      iframe.style.height = Math.max(cfg.minHeight, e.data.height) + "px";
    });
  }

  if (cfg.mode === "button") {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cfg.buttonText;
    btn.style.cssText =
      "cursor:pointer;border:0;border-radius:9999px;padding:12px 22px;" +
      "font:600 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#fff;background:" + cfg.buttonColor + ";";
    script.parentNode.insertBefore(btn, script.nextSibling);

    btn.addEventListener("click", function () {
      var overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;";

      var panel = document.createElement("div");
      panel.style.cssText =
        "position:relative;width:100%;max-width:980px;height:90vh;" +
        "background:#fff;border-radius:16px;overflow:hidden;" +
        "box-shadow:0 20px 60px rgba(0,0,0,.3);";

      var close = document.createElement("button");
      close.type = "button";
      close.textContent = "×"; // ×
      close.setAttribute("aria-label", "Close");
      close.style.cssText =
        "position:absolute;top:6px;right:12px;z-index:1;border:0;" +
        "background:transparent;font-size:30px;line-height:1;cursor:pointer;" +
        "color:#171717;";

      var iframe = makeIframe();
      iframe.style.height = "100%";

      panel.appendChild(close);
      panel.appendChild(iframe);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      var prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      function dismiss() {
        overlay.remove();
        document.body.style.overflow = prevOverflow;
        document.removeEventListener("keydown", onKey);
      }
      function onKey(e) {
        if (e.key === "Escape") dismiss();
      }
      close.addEventListener("click", dismiss);
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) dismiss();
      });
      document.addEventListener("keydown", onKey);
    });
  } else {
    // inline (default)
    var frame = makeIframe();
    attachAutoResize(frame);
    script.parentNode.insertBefore(frame, script.nextSibling);
  }
})();
