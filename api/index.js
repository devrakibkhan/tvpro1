// api/index.js

const PORTAL_URL = "http://mag.jee-ott.xyz/server/load.php"; 
const MAC_ADDRESS = "00:1A:79:6F:0F:1A";

async function getTokenAndCookie() {
  const headers = {
    "Cookie": `mac=${MAC_ADDRESS}`,
    "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
  };

  try {
    const handshakeUrl = `${PORTAL_URL}?type=stb&action=handshake&token=&JsHttpRequest=1-xml`;
    const response = await fetch(handshakeUrl, { headers });
    const textData = await response.text(); 
    
    try {
      const data = JSON.parse(textData);
      const token = data?.js?.token || '';
      return { token, cookie: `mac=${MAC_ADDRESS}` };
    } catch (e) {
      console.error("Handshake failed. Server returned:", textData);
      return { token: '', cookie: `mac=${MAC_ADDRESS}` };
    }
  } catch (error) {
    console.error("Token fetch error:", error);
    return { token: '', cookie: `mac=${MAC_ADDRESS}` };
  }
}

export default async function handler(req, res) {
  const { url, query } = req;

  // ১. M3U8 প্লেলিস্ট রিকোয়েস্ট হ্যান্ডেল করা
  if (url.startsWith('/api/playlist.m3u8')) {
    const auth = await getTokenAndCookie();
    
    const headers = {
      "Cookie": auth.cookie,
      "Authorization": `Bearer ${auth.token}`,
      "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
    };

    const channelsUrl = `${PORTAL_URL}?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    
    try {
      const response = await fetch(channelsUrl, { headers });
      const textData = await response.text();
      let data;
      
      try {
        data = JSON.parse(textData);
      } catch (e) {
        return res.status(500).send("Error: Server blocked the request or sent invalid data.");
      }

      const channels = data?.js?.data || [];
      if (channels.length === 0) {
        return res.status(404).send("No channels found or MAC blocked.");
      }

      // বেস ইউআরএল (Base URL) তৈরি করা
      const host = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${host}`;

      let m3u = "#EXTM3U\n";

      for (const channel of channels) {
        const name = channel.name || "Unknown Channel";
        const id = channel.id || "";
        const cmd = channel.cmd || "";
        const logo = channel.logo || "";

        m3u += `#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}",${name}\n`;
        m3u += `${baseUrl}/api/play?channel=${encodeURIComponent(cmd)}\n`;
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u8"');
      return res.status(200).send(m3u);

    } catch (error) {
      return res.status(500).send("Error connecting to server.");
    }
  }

  // ২. প্লে-লিংক এবং রিডাইরেক্ট হ্যান্ডেল করা
  if (url.startsWith('/api/play')) {
    const channelCmd = query.channel;
    
    if (!channelCmd) {
      return res.status(400).send("Channel parameter is missing.");
    }

    const auth = await getTokenAndCookie();
    
    const headers = {
      "Cookie": auth.cookie,
      "Authorization": `Bearer ${auth.token}`,
      "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
    };

    const linkUrl = `${PORTAL_URL}?type=itv&action=create_link&cmd=${encodeURIComponent(channelCmd)}&JsHttpRequest=1-xml`;
    
    try {
      const response = await fetch(linkUrl, { headers });
      const data = await response.json();
      let streamUrl = data?.js?.cmd || "";

      if (streamUrl.includes(" ")) {
        streamUrl = streamUrl.split(" ").pop(); 
      }

      if (streamUrl && streamUrl.startsWith("http")) {
        // 302 Redirect
        return res.redirect(302, streamUrl);
      } else {
        return res.status(404).send("Stream URL not found.");
      }
    } catch (error) {
      return res.status(500).send("Error creating stream link.");
    }
  }

  // ৩. ডিফল্ট রেসপন্স
  return res.status(200).send("Please visit /api/playlist.m3u8 to get your M3U8 playlist.");
}
