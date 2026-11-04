/**
 * Cloudflare Worker: ZimaTrade AI Watchdog & Geo-Proxy
 * 1. Scheduled (1-minute cron): Dead-Man's Switch pings Node A /api/system/health.
 *    If Node A is unreachable or event loop frozen > 5s, triggers emergency Telegram alert.
 * 2. Fetch handler (HTTP Reverse Proxy):
 *    - /bybit/* -> Proxies to https://api.bybit.com/* (bypasses CloudFront geo-blocking for Russian datacenters)
 *    - /telegram/* -> Proxies to https://api.telegram.org/* (ensures reliable Telegram API communication)
 *    - /health -> Returns Watchdog status
 */

export default {
  // HTTP Request Handler (Reverse Proxy for Bybit & Telegram)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Root / Health endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ONLINE',
          node: 'Node C (Cloudflare Edge)',
          timestamp: Date.now(),
          features: ['dead_mans_switch_cron', 'bybit_v5_proxy', 'telegram_proxy'],
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Bybit API v5 Reverse Proxy (/bybit/v5/...)
    if (url.pathname.startsWith('/bybit/')) {
      const targetPath = url.pathname.replace('/bybit', '') + url.search;
      const targetUrl = `https://api.bybit.com${targetPath}`;

      const headers = new Headers(request.headers);
      headers.set('Host', 'api.bybit.com');
      headers.delete('cf-connecting-ip');
      headers.delete('cf-ray');

      const proxyReq = new Request(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      return await fetch(proxyReq);
    }

    // 3. Telegram Bot API Reverse Proxy (/telegram/bot...)
    if (url.pathname.startsWith('/telegram/')) {
      const targetPath = url.pathname.replace('/telegram', '') + url.search;
      const targetUrl = `https://api.telegram.org${targetPath}`;

      const headers = new Headers(request.headers);
      headers.set('Host', 'api.telegram.org');

      const proxyReq = new Request(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      return await fetch(proxyReq);
    }

    return new Response('Not Found', { status: 404 });
  },

  // 1-Minute Cron Trigger (Dead-Man's Switch)
  async scheduled(event, env, ctx) {
    const NODE_A_HEALTH_URL =
      env.NODE_A_HEALTH_URL || 'http://194.113.34.230:3000/api/system/health';
    const TG_ALERT_BOT_TOKEN = env.TG_ALERT_BOT_TOKEN;
    const TG_ALERT_CHAT_ID = env.TG_ALERT_CHAT_ID;

    try {
      const resp = await fetch(NODE_A_HEALTH_URL, {
        headers: { 'X-Watchdog-Token': env.WATCHDOG_SECRET || 'default_secret' },
        cf: { cacheTtl: 0 },
      });

      if (!resp.ok) {
        throw new Error(`Node A returned HTTP status ${resp.status}`);
      }

      const body = await resp.json();
      const loopDeltaSec = body.vcpu0_loop_age_sec || 0;

      if (loopDeltaSec > 5.0) {
        throw new Error(
          `vCPU 0 Loop Frozen! Last alive ${loopDeltaSec.toFixed(1)}s ago.`
        );
      }

      if (env.KV_STATE) {
        await env.KV_STATE.put('consecutive_failures', '0');
      }
    } catch (err) {
      console.error("Dead-Man's Switch Alarm:", err?.message || err);

      let failures = 1;
      if (env.KV_STATE) {
        const prev = parseInt(
          (await env.KV_STATE.get('consecutive_failures')) || '0'
        );
        failures = prev + 1;
        await env.KV_STATE.put('consecutive_failures', failures.toString());
      }

      if (failures >= 2 && TG_ALERT_BOT_TOKEN && TG_ALERT_CHAT_ID) {
        const alertMsg = `🚨 [ZimaTrade AI CRITICAL ALARM]\nNode A (Cloud Core) is DOWN or Unreachable!\nIP: 194.113.34.230:3000\nError: ${err?.message || err}\nFailures: ${failures} consecutive.\nInitiating emergency order cancellation protocol...`;
        await fetch(
          `https://api.telegram.org/bot${TG_ALERT_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: TG_ALERT_CHAT_ID,
              text: alertMsg,
            }),
          }
        );
      }
    }
  },
};
