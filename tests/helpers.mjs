import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";
import { DOMParser as XmldomParser, XMLSerializer } from "@xmldom/xmldom";

class QueryDomParser extends XmldomParser {
  parseFromString(text, mimeType) {
    return patchSelectorApi(super.parseFromString(text, mimeType));
  }
}

export function installDomShim() {
  globalThis.DOMParser = QueryDomParser;
  globalThis.XMLSerializer = XMLSerializer;
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
}

export function findNode(node, id) {
  const found = findNodeOrNull(node, id);
  if (found) return found;
  const ids = [];
  const tags = [];
  collectIds(node, ids);
  collectTags(node, tags);
  throw new Error(`missing node: ${id}; available ids: ${ids.join(", ")}; tags: ${tags.join(", ")}`);
}

export function unzip(bytes) {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(flags & 0x08, 0, "data descriptors are not supported by this test unzipper");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (compression === 0) {
      entries.set(name, compressed);
    } else if (compression === 8) {
      entries.set(name, inflateRawSync(compressed));
    } else {
      throw new Error(`unsupported zip compression ${compression} for ${name}`);
    }
    offset = dataStart + compressedSize;
  }
  return entries;
}

export function textEntry(entries, name) {
  const value = entries.get(name);
  assert(value, `missing ZIP entry: ${name}`);
  return value.toString("utf8");
}

export function xmlEntityDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function findNodeOrNull(node, id) {
  if (node.attributes?.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeOrNull(child, id);
    if (found) return found;
  }
  return null;
}

function collectIds(node, ids) {
  if (node.attributes?.id) ids.push(node.attributes.id);
  for (const child of node.children ?? []) collectIds(child, ids);
}

function collectTags(node, tags) {
  tags.push(node.tag);
  for (const child of node.children ?? []) collectTags(child, tags);
}

function patchSelectorApi(document) {
  const querySelectorAll = function querySelectorAll(selector) {
    const normalized = selector.trim();
    assert.match(normalized, /^[A-Za-z_][A-Za-z0-9_.:-]*$/);
    const name = normalized.split(":").pop();
    const matches = [];
    const visit = (node) => {
      if (node?.nodeType === 1 && (node.localName || node.nodeName).split(":").pop() === name) {
        matches.push(node);
      }
      for (const child of Array.from(node?.childNodes ?? [])) visit(child);
    };
    visit(this.documentElement ?? this);
    return matches;
  };
  const querySelector = function querySelector(selector) {
    return querySelectorAll.call(this, selector)[0] ?? null;
  };
  const install = (node) => {
    if (node && typeof node === "object") {
      node.querySelector ??= querySelector;
      node.querySelectorAll ??= querySelectorAll;
      for (const child of Array.from(node.childNodes ?? [])) install(child);
    }
  };
  install(document);
  return document;
}
