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

        res.setEncoding("utf
