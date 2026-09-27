/**
 * Registry for scraping actors.
 */

import type { ActorType, IActor } from "../api/types";
// corpus: LLM training data source actors
import { ArxivActor } from "./corpus/arxiv-actor";
import { ClinicalTrialsActor } from "./corpus/clinical-trials-actor";
import { CourtListenerActor } from "./corpus/court-listener-actor";
import { DergiParkActor } from "./corpus/dergipark-actor";
import { EurLexActor } from "./corpus/eur-lex-actor";
import { EuropePmcActor } from "./corpus/europe-pmc-actor";
import { GutenbergActor } from "./corpus/gutenberg-actor";
import { IetfRfcActor } from "./corpus/ietf-rfc-actor";
import { InternetArchiveActor } from "./corpus/internet-archive-actor";
import { KtbEkitapActor } from "./corpus/ktb-ekitap-actor";
import { MitOcwActor } from "./corpus/mit-ocw-actor";
import { OpenFdaActor } from "./corpus/open-fda-actor";
import { OpenAlexActor } from "./corpus/openalex-actor";
import { OpenStaxActor } from "./corpus/openstax-actor";
import { SaglikEkutuphaneActor } from "./corpus/saglik-ekutuphane-actor";
import { SecEdgarActor } from "./corpus/sec-edgar-actor";
import { SoftwareHeritageActor } from "./corpus/software-heritage-actor";
import { StackExchangeActor } from "./corpus/stack-exchange-actor";
import { WikimediaActor } from "./corpus/wikimedia-actor";
// documents: local file and archive extraction actors
import { ArchiveExtractorActor } from "./documents/archive-extractor-actor";
import { DocumentExtractorActor } from "./documents/document-extractor-actor";
import { EpubExtractorActor } from "./documents/epub-extractor-actor";
import { PdfDocumentActor } from "./documents/pdf-document-actor";
// web: general-purpose web extraction actors
import { ApiExtractorActor } from "./web/api-extractor-actor";
import { CheerioScraperActor } from "./web/cheerio-scraper-actor";
import { CrawlerActor } from "./web/crawler-actor";
import { MarkdownReaderActor } from "./web/markdown-reader-actor";
import { NetworkInterceptorActor } from "./web/network-interceptor-actor";
import { PlaywrightBrowserActor } from "./web/playwright-browser-actor";
import { SerpSearchActor } from "./web/serp-search-actor";
import { SitemapXmlActor } from "./web/sitemap-xml-actor";

export class ActorRegistry {
  private readonly actors = new Map<ActorType, IActor<unknown>>();

  register(actor: IActor<unknown>): void {
    this.actors.set(actor.actorType, actor);
  }

  get<T = unknown>(type: ActorType): IActor<T> | undefined {
    return this.actors.get(type) as IActor<T> | undefined;
  }

  has(type: ActorType): boolean {
    return this.actors.has(type);
  }

  list(): IActor<unknown>[] {
    return Array.from(this.actors.values());
  }
}

export function createDefaultActorRegistry(): ActorRegistry {
  const registry = new ActorRegistry();
  registry.register(new CheerioScraperActor());
  registry.register(new PlaywrightBrowserActor());
  registry.register(new ApiExtractorActor());
  registry.register(new CrawlerActor());
  registry.register(new SitemapXmlActor());
  registry.register(new MarkdownReaderActor());
  registry.register(new NetworkInterceptorActor());
  registry.register(new SerpSearchActor());
  registry.register(new PdfDocumentActor());
  registry.register(new ArxivActor());
  registry.register(new WikimediaActor());
  registry.register(new OpenAlexActor());
  registry.register(new StackExchangeActor());
  registry.register(new GutenbergActor());
  registry.register(new EuropePmcActor());
  registry.register(new IetfRfcActor());
  registry.register(new SaglikEkutuphaneActor());
  registry.register(new KtbEkitapActor());
  registry.register(new DocumentExtractorActor());
  registry.register(new ArchiveExtractorActor());
  registry.register(new EpubExtractorActor());
  registry.register(new DergiParkActor());
  registry.register(new InternetArchiveActor());
  registry.register(new ClinicalTrialsActor());
  registry.register(new OpenFdaActor());
  registry.register(new SecEdgarActor());
  registry.register(new CourtListenerActor());
  registry.register(new SoftwareHeritageActor());
  registry.register(new EurLexActor());
  registry.register(new OpenStaxActor());
  registry.register(new MitOcwActor());
  return registry;
}
