import { AgentToolExecutor, type ToolExecutionResult } from './executor.js';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
};

export type StreamCallbacks = {
  onStatus?: (status: string) => void;
  onDelta?: (content: string) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, result: ToolExecutionResult) => void;
};

export class AgentOrchestrator {
  private readonly executor: AgentToolExecutor;

  public constructor(executor?: AgentToolExecutor) {
    this.executor = executor || new AgentToolExecutor();
  }

  public async run(
    messages: ChatMessage[],
    modelId: string = 'protokol7/extractor-ai',
    callbacks?: StreamCallbacks
  ): Promise<{
    content: string;
    toolCalls: { name: string; args: Record<string, unknown>; result: ToolExecutionResult }[];
    tokensUsed: { prompt: number; completion: number };
  }> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const executedToolCalls: { name: string; args: Record<string, unknown>; result: ToolExecutionResult }[] = [];

    // Extract potential URL from user message
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urlMatches = lastUserMessage.match(urlRegex);
    const targetUrl = urlMatches ? urlMatches[0] : null;

    // Check if the user is requesting scraping/analysis/extraction
    const isScrapingIntent =
      Boolean(targetUrl) ||
      /(tara|çek|kazı|analiz|scrape|extract|ürün|fiyat|tablo|liste|veri|url)/i.test(lastUserMessage);

    let finalContent = '';

    if (targetUrl && isScrapingIntent) {
      // Step 1: Analyze Target
      callbacks?.onStatus?.('🔍 Hedef web sitesi ve güvenlik mimarisi analiz ediliyor...');
      callbacks?.onToolStart?.('analyze_target', { url: targetUrl });
      const analysisResult = await this.executor.execute('analyze_target', { url: targetUrl });
      callbacks?.onToolEnd?.('analyze_target', analysisResult);
      executedToolCalls.push({ name: 'analyze_target', args: { url: targetUrl }, result: analysisResult });

      const isSpa = Boolean(analysisResult.output['is_spa']);
      const recommendedEngine = (analysisResult.output['recommended_engine'] as string) || 'http';
      const proxyTier = (analysisResult.output['recommended_proxy_tier'] as string) || 'datacenter';

      // Step 2: Scrape content using chosen engine
      let scrapeResult: ToolExecutionResult;
      let rawHtml = '';

      if (recommendedEngine === 'browser' || isSpa) {
        callbacks?.onStatus?.('🌐 Dinamik JavaScript ve bot koruması tespit edildi. Playwright ve Residential Proxy başlatılıyor...');
        callbacks?.onToolStart?.('scrape_browser', { url: targetUrl });
        scrapeResult = await this.executor.execute('scrape_browser', { url: targetUrl });
        callbacks?.onToolEnd?.('scrape_browser', scrapeResult);
        executedToolCalls.push({ name: 'scrape_browser', args: { url: targetUrl }, result: scrapeResult });
        rawHtml = String(scrapeResult.output['html_content'] || '');
      } else {
        callbacks?.onStatus?.('⚡ Hızlı HTTP Motoru ile statik HTML içeriği indiriliyor...');
        callbacks?.onToolStart?.('scrape_http', { url: targetUrl, proxy_tier: proxyTier });
        scrapeResult = await this.executor.execute('scrape_http', { url: targetUrl, proxy_tier: proxyTier });
        callbacks?.onToolEnd?.('scrape_http', scrapeResult);
        executedToolCalls.push({ name: 'scrape_http', args: { url: targetUrl, proxy_tier: proxyTier }, result: scrapeResult });
        rawHtml = String(scrapeResult.output['html_content'] || '');
      }

      // Step 3: Extract structured data
      callbacks?.onStatus?.('📊 Yapısal veri alanları ayrıştırılıyor ve şema doğrulanıyor...');
      callbacks?.onToolStart?.('extract_structured_data', { html: rawHtml.slice(0, 5000), fields: [{ name: 'title' }, { name: 'price' }, { name: 'rating' }] });
      const extractResult = await this.executor.execute('extract_structured_data', {
        html: rawHtml,
        fields: [{ name: 'title' }, { name: 'price' }, { name: 'rating' }]
      });
      callbacks?.onToolEnd?.('extract_structured_data', extractResult);
      executedToolCalls.push({ name: 'extract_structured_data', args: { fields: ['title', 'price', 'rating'] }, result: extractResult });

      const extractedItems = (extractResult.output['items'] as Record<string, unknown>[]) || [];

      // Step 4: Export dataset & generate preview
      callbacks?.onStatus?.('📁 Veri seti oluşturuluyor ve önizleme hazırlanıyor...');
      callbacks?.onToolStart?.('export_dataset', { data: extractedItems, format: 'json' });
      const exportResult = await this.executor.execute('export_dataset', {
        data: extractedItems,
        format: 'json',
        filename: 'protokol7_extracted_data'
      });
      callbacks?.onToolEnd?.('export_dataset', exportResult);
      executedToolCalls.push({ name: 'export_dataset', args: { format: 'json' }, result: exportResult });

      const previewTable = String(exportResult.output['preview_table'] || '');

      // Synthesize final response
      finalContent = [
        `### 🎯 Görev Başarıyla Tamamlandı`,
        ``,
        `Hedef web adresi (**${targetUrl}**) otonom olarak analiz edildi ve aşağıdaki strateji uygulandı:`,
        ``,
        `- **Seçilen Motor:** ${recommendedEngine === 'browser' ? '🌐 Playwright Headless Tarayıcı Motoru' : '⚡ Hızlı HTTP Kazıma Motoru'}`,
        `- **Proxy Katmanı:** \`${proxyTier}\``,
        `- **Bot Koruması / Güvenlik Durumu:** ${analysisResult.output['anti_bot'] || 'Standart' }`,
        `- **Toplanan Kayıt Sayısı:** **${extractedItems.length}** adet`,
        ``,
        `#### 📊 Çıkarılan Veri Önizlemesi:`,
        ``,
        previewTable,
        ``,
        `\`\`\`json`,
        JSON.stringify(extractedItems, null, 2),
        `\`\`\``,
        ``,
        `İstediğiniz takdirde bu verileri farklı bir şemada filtreleyebilir veya doğrudan dışa aktarım formatını değiştirebilirim.`
      ].join('\n');
    } else {
      // Conversational answer
      callbacks?.onStatus?.('💬 Yanıt hazırlanıyor...');
      finalContent = [
        `Merhaba! Ben **Protokol-7 Otonom Kazıma ve Veri Toplama Ajanı** (${modelId}).`,
        ``,
        `Bana kazımak veya analiz etmek istediğiniz herhangi bir web sitesi adresini (URL) ve toplamak istediğiniz veri tipini söylemeniz yeterlidir.`,
        ``,
        `### Neler Yapabilirim?`,
        `- **Otonom Hedef Analizi:** Hedef sitenin Cloudflare/Datadome bot korumasını ve SPA yapısını tespit edip en uygun motoru seçerim.`,
        `- **Hibrit Motor Desteği:** İhtiyaca göre ultra hızlı HTTP motoru veya JavaScript render eden Playwright tarayıcı motorunu devreye alırım.`,
        `- **Otomatik Şema ve CSS/XPath Çıkarımı:** Sayfa DOM ağacını inceleyerek ürün, fiyat, liste, makale vb. verileri JSON/CSV tablosuna dönüştürürüm.`,
        `- **Akıllı Proxy ve Hız Sınırlaması:** Hedef sitenin hız limitlerine takılmadan proxy rotasyonu yaparım.`,
        ``,
        `Başlamak için lütfen hedef bir URL veya kazıma görevi belirtin.`
      ].join('\n');
    }

    // Stream out chunks via onDelta
    const chunkSize = 24;
    for (let i = 0; i < finalContent.length; i += chunkSize) {
      const chunk = finalContent.slice(i, i + chunkSize);
      callbacks?.onDelta?.(chunk);
    }

    return {
      content: finalContent,
      toolCalls: executedToolCalls,
      tokensUsed: {
        prompt: Math.ceil(lastUserMessage.length / 4) + 120,
        completion: Math.ceil(finalContent.length / 4)
      }
    };
  }
}
