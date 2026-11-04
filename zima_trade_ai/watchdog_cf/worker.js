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

    // 1. Watchdog Health endpoint
    if (url.pathname === '/watchdog-status' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ONLINE',
          node: 'Node C (Cloudflare Edge)',
          subdomain: 'zimaaa-lab.workers.dev',
          target_node_a: 'http://194.113.34.230:3000',
          timestamp: Date.now(),
          features: ['terminal_reverse_proxy', 'dead_mans_switch_cron', 'bybit_v5_proxy', 'telegram_proxy'],
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

    // 4. Full Web Terminal & API Reverse Proxy to Node A (Cloud.ru: http://194.113.34.230:3000)
    // Allows full HTTPS access without buying or configuring a custom domain!
    const nodeAOrigin = env.NODE_A_ORIGIN || 'http://194.113.34.230:3000';
    const targetUrl = `${nodeAOrigin.replace(/\/$/, '')}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.set('Host', '194.113.34.230:3000');
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', url.host);

    try {
      const proxyReq = new Request(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      return await fetch(proxyReq);
    } catch (err) {
      return new Response(
        `<html><body style="font-family:sans-serif;padding:30px;background:#0f172a;color:#f8fafc">` +
        `<h2>⚠️ ZimaTrade AI — Ошибка шлюза</h2>` +
        `<p>Не удалось подключиться к ядру Node A: <code>${nodeAOrigin}</code></p>` +
        `<p>Ошибка: <code>${err?.message || err}</code></p>` +
        `<p>Проверьте запуск сервера: <code>pm2 status zima-core</code> на сервере Cloud.ru.</p>` +
        `</body></html>`,
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
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
