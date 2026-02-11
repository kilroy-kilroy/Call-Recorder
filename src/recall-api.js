const https = require("https");

/**
 * Client for the Recall.ai REST API — used for creating SDK uploads
 * and retrieving recordings. This runs in the Electron main process.
 */
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

  /**
   * Create a Desktop SDK upload. Returns { id, upload_token, recording_id }.
   * The upload_token is passed to RecallAiSdk.startRecording().
   */
  async createSdkUpload(recordingConfig = null) {
    const body = {};
    if (recordingConfig) {
      body.recording_config = recordingConfig;
    }
    return this._request("POST", "/sdk_upload/", body);
  }

  /**
   * Retrieve a recording by ID. Returns media download URLs.
   */
  async getRecording(recordingId) {
    return this._request("GET", `/recording/${recordingId}/`);
  }

  /**
   * List SDK uploads.
   */
  async listSdkUploads(cursor = null) {
    const query = cursor ? `?cursor=${cursor}` : "";
    return this._request("GET", `/sdk_upload/${query}`);
  }

  /**
   * Retrieve a specific SDK upload by ID.
   */
  async getSdkUpload(uploadId) {
    return this._request("GET", `/sdk_upload/${uploadId}/`);
  }
}

module.exports = RecallAPI;
