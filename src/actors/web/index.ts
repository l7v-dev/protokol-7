/**
 * Web extraction actor barrel — general-purpose web scraping actors.
 * Actors in this category fetch and parse publicly accessible web pages,
 * APIs, and search engine result pages using HTTP or headless Chromium.
 */

export * from "./api-extractor-actor";
export * from "./cheerio-scraper-actor";
export * from "./crawler-actor";
export * from "./markdown-reader-actor";
export * from "./network-interceptor-actor";
export * from "./playwright-browser-actor";
export * from "./serp-search-actor";
export * from "./sitemap-xml-actor";
