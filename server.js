const http = require("http");
const https = require("https");
const crypto = require("crypto");

const API = "https://bt7.api.mega.co.nz";

function parseTransferUrl(raw) {
  const u = new URL(raw);

  if (
    u.hostname !== "transfer.it" &&
    u.hostname !== "www.transfer.it"
  ) {
    throw new Error("Only transfer.it links are supported");
  }

  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("t");

  if (i < 0 || !parts[i + 1]) {
    throw new Error("Invalid transfer.it link");
  }

  return parts[i + 1];
}

function base64UrlDecode(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");

  while (s.length % 4 !== 0) {
    s += "=";
  }

  return Buffer.from(s, "base64");
}

function decryptNodeName(node) {
  if (!node.a || !node.k) {
    return node.h;
  }

  try {
    const attributes = base64UrlDecode(node.a);
    const key = base64UrlDecode(node.k);

    if (attributes.length === 0 || key.length < 16) {
      return node.h;
    }

    const aesKey = Buffer.alloc(16);

    for (let i = 0; i < 16; i++) {
      aesKey[i] =
        key[i] ^
        key[i + 16] ^
        key[i + 32] ^
        key[i + 48];
    }

    const decipher = crypto.createDecipheriv(
      "aes-128-cbc",
      aesKey,
      Buffer.alloc(16)
    );

    decipher.setAutoPadding(false);

    const decrypted = Buffer.concat([
      decipher.update(attributes),
      decipher.final()
    ]);

    const text = decrypted
      .toString("utf8")
      .replace(/\0+$/, "");

    if (!text.startsWith("MEGA{")) {
      return node.h;
    }

    const json = text.slice(4);
    const parsed = JSON.parse(json);

    if (parsed.n) {
      return parsed.n;
    }
  } catch (error) {
    return node.h;
  }

  return node.h;
}

function apiRequest(handle) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify([
      {
        a: "f",
        c: 1,
        r: 1
      }
    ]);

    const url =
      API +
      "/cs?id=" +
      Date.now() +
      "&x=" +
      encodeURIComponent(handle);

    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "Mozilla/5.0"
        }
      },
      (res) => {
        let data = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                "Transfer API returned HTTP " + res.statusCode
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(
              new Error("Invalid Transfer API response")
            );
          }
        });
      }
    );

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

async function getFiles(handle) {
  const response = await apiRequest(handle);

  if (!Array.isArray(response) || !response[0]) {
    throw new Error("Unexpected Transfer API response");
  }

  const nodes = response[0].f;

  if (!Array.isArray(nodes)) {
    throw new Error("No file list returned");
  }

  return nodes
    .filter((node) => node.t === 0)
    .map((node) => ({
      handle: node.h,
      size: node.s,
      name: decryptNodeName(node)
    }));
}

function getDownloadUrl(handle, file) {
  return (
    API +
    "/cs/g" +
    "?x=" +
    encodeURIComponent(handle) +
    "&n=" +
    encodeURIComponent(file.handle) +
    "&fn=" +
    encodeURIComponent(file.name)
  );
}

function getRedirect(downloadUrl, handle) {
  return new Promise((resolve, reject) => {
    const u = new URL(downloadUrl);

    const req = https.request(
      u,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://transfer.it/t/" + handle,
          "Origin": "https://transfer.it",
          "Range": "bytes=0-0"
        }
      },
      (res) => {
        const location = res.headers.location;

        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          location
        ) {
          res.destroy();
          resolve(location);
          return;
        }

        res.destroy();

        reject(
          new Error(
            "Transfer.it did not return a download URL. HTTP " +
              res.statusCode
          )
        );
      }
    );

    req.on("error", reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(
      req.url,
      "http://" + req.headers.host
    );

    if (requestUrl.pathname === "/list") {
      const transferUrl =
        requestUrl.searchParams.get("url");

      if (!transferUrl) {
        res.writeHead(400, {
          "Content-Type":
            "text/plain; charset=utf-8"
        });

        res.end(
          "Missing ?url=transfer.it-link"
        );

        return;
      }

      const handle = parseTransferUrl(transferUrl);
      const files = await getFiles(handle);

      const result = {
        transfer: handle,
        count: files.length,
        files: files.map((file, index) => ({
          index: index,
          name: file.name,
          size: file.size,
          handle: file.handle,
          url:
            "https://" +
            requestUrl.host +
            "/file?url=" +
            encodeURIComponent(transferUrl) +
            "&i=" +
            index
        }))
      };

      res.writeHead(200, {
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(
        JSON.stringify(result, null, 2)
      );

      return;
    }

    if (requestUrl.pathname === "/file") {
      const transferUrl =
        requestUrl.searchParams.get("url");

      const indexText =
        requestUrl.searchParams.get("i");

      if (!transferUrl) {
        res.writeHead(400);
        res.end(
          "Missing ?url=transfer.it-link"
        );
        return;
      }

      const index = Number(indexText);

      if (!Number.isInteger(index) || index < 0) {
        res.writeHead(400);
        res.end("Invalid file index");
        return;
      }

      const handle = parseTransferUrl(transferUrl);
      const files = await getFiles(handle);

      if (index >= files.length) {
        res.writeHead(404);
        res.end(
          "File index out of range"
        );
        return;
      }

      const downloadUrl = getDownloadUrl(
        handle,
        files[index]
      );

      const location = await getRedirect(
        downloadUrl,
        handle
      );

      res.writeHead(302, {
        Location: location
      });

      res.end();

      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    res.writeHead(502, {
      "Content-Type":
        "text/plain; charset=utf-8"
    });

    res.end(
      "Proxy error: " + error.message
    );
  }
});

const port = process.env.PORT || 3000;

server.listen(port, "0.0.0.0", () => {
  console.log(
    "Transfer proxy running on port " + port
  );
});
