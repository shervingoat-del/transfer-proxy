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

function apiRequest(handle) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify([
      { a: "f", c: 1, r: 1 }
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
          "User-Agent": "Mozilla/5.0
