const https = require("https");

class RecallAPI {
  constructor(apiKey, region = "us-west-2") {
    this.apiKey = apiKey;
    this.baseHost = `${region}.recall.ai`;
    this.basePath = "/api/v1";
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseHost,
        path: `${this.basePath}${path}`,
        method,
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            reject(
              new Error(
                `API error ${res.statusCode}: ${data || res.statusMessage}`
              )
            );
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async createBot(meetingUrl, botName = "Call Recorder", options = {}) {
    const body = {
      meeting_url: meetingUrl,
      bot_name: botName,
      recording_config: {
        video_mixed_mp4: {},
        transcript: {
          provider: {
            meeting_captions: {},
          },
        },
        ...options.recording_config,
      },
    };

    if (options.join_at) {
      body.join_at = options.join_at;
    }

    return this._request("POST", "/bot/", body);
  }

  async getBot(botId) {
    return this._request("GET", `/bot/${botId}/`);
  }

  async listBots(cursor = null) {
    const query = cursor ? `?cursor=${cursor}` : "";
    return this._request("GET", `/bot/${query}`);
  }

  async deleteBot(botId) {
    return this._request("DELETE", `/bot/${botId}/`);
  }

  async leaveMeeting(botId) {
    return this._request("POST", `/bot/${botId}/leave_call/`);
  }

  getLatestStatus(bot) {
    if (!bot.status_changes || bot.status_changes.length === 0) {
      return { code: "unknown", sub_code: null };
    }
    return bot.status_changes[bot.status_changes.length - 1];
  }

  getRecordingUrl(bot) {
    if (
      bot.recordings &&
      bot.recordings.length > 0 &&
      bot.recordings[0].media_shortcuts
    ) {
      const shortcuts = bot.recordings[0].media_shortcuts;
      if (shortcuts.video_mixed && shortcuts.video_mixed.data) {
        return shortcuts.video_mixed.data.download_url;
      }
    }
    return null;
  }

  getTranscriptUrl(bot) {
    if (
      bot.recordings &&
      bot.recordings.length > 0 &&
      bot.recordings[0].media_shortcuts
    ) {
      const shortcuts = bot.recordings[0].media_shortcuts;
      if (shortcuts.transcript && shortcuts.transcript.data) {
        return shortcuts.transcript.data.download_url;
      }
    }
    return null;
  }
}

module.exports = RecallAPI;
