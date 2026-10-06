const http = require("http");
const https = require("https");
const crypto = require("crypto");

const API = "https://bt7.api.mega.co.nz";

function parseTransferUrl(raw) {
  const u = new URL(raw);

  if (u.hostname !== "transfer.it" && u.hostname !== "www.transfer.it") {
    throw new Error("Only transfer.it links are supported");
  }

  const parts = u.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("t");

  if (index === -1 || !parts[index + 1]) {
    throw new Error("Invalid transfer.it link");
  }

  return parts[index + 1];
}

function apiRequest(handle) {
  return new Promise((resolve, reject) => {
    const query =
      "?id=" +
      Date.now() +
      "&x=" +
      encodeURIComponent(handle);

    const body = JSON.stringify([
      {
        a: "f",
        c: 1,
        r: 1
      }
    ]);

    const req = https.request(
      API + "/cs" + query,
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
      name: node.h
    }));
}

function getDownloadUrl(handle, file) {
  const fileName = file.name || file.handle;

  return (
    API +
    "/cs/g" +
    "?x=" +
    encodeURIComponent(handle) +
    "&n=" +
    encodeURIComponent(file.handle) +
    "&fn=" +
    encodeURIComponent(fileName)
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
          "Origin": "https://transfer.it"
        }
      },
      (res) => {
        const location = res.headers.location;

        res.resume();

        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          location
        ) {
          resolve(location);
          return;
        }

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
      const transferUrl = requestUrl.searchParams.get("url");

      if (!transferUrl) {
        res.writeHead(400, {
          "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Missing ?url=transfer.it-link");
        return;
      }

      const handle = parseTransferUrl(transferUrl);
      const files = await getFiles(handle);

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
      });

      res.end(
        JSON.stringify(
          {
            transfer: handle,
            count: files.length,
            files: files.map((file, index) => ({
              index: index,
              handle: file.handle,
              size: file.size,
              url:
                "https://" +
                requestUrl.host +
                "/file?url=" +
                encodeURIComponent(transferUrl) +
                "&i=" +
                index
            }))
          },
          null,
          2
        )
      );

      return;
    }

    if (requestUrl.pathname === "/file") {
      const transferUrl = requestUrl.searchParams.get("url");
      const indexText = requestUrl.searchParams.get("i");

      if (!transferUrl) {
        res.writeHead(400);
        res.end("Missing ?url=transfer.it-link");
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
          "File index out of range. This transfer contains " +
            files.length +
            " file(s)."
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
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Proxy error: " + error.message);
  }
});

const port = process.env.PORT || 3000;

server.listen(port, "0.0.0.0", () => {
  console.log(
    "Transfer proxy running on port " + port
  );
});
