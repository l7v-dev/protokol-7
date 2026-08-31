export type ToolParameterProperty = {
  type: string;
  description: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, ToolParameterProperty>;
    required?: string[];
  };
};

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterProperty>;
      required: string[];
    };
  };
};

export const PROTOKOL7_AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'analyze_target',
      description: 'Hedef web sitesinin mimarisini, bot korumasını (Cloudflare vb.), SPA/JavaScript bağımlılığını ve uygun kazıma motorunu analiz eder.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Analiz edilecek hedef web sitesinin tam URL adresi (örn: https://example.com/products)'
          },
          timeout_ms: {
            type: 'number',
            description: 'Maksimum analiz bekleme süresi (milisaniye cinsinden, varsayılan: 5000)'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scrape_http',
      description: 'Statik veya hafif sayfaları yüksek hızda ve düşük maliyetle HTTP motoru ile indirir.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Kazınacak web sayfasının URL adresi'
          },
          headers: {
            type: 'object',
            description: 'İstekle birlikte gönderilecek özel HTTP başlıkları (User-Agent, Cookie vb.)'
          },
          proxy_tier: {
            type: 'string',
            description: 'Kullanılacak proxy katmanı',
            enum: ['datacenter', 'residential', 'mobile', 'none']
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scrape_browser',
      description: 'Dinamik JavaScript, React/Vue/SPA ve bot korumalı sayfaları Playwright tarayıcı motoru ile render eder.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Tarayıcıda açılacak web sayfası URL adresi'
          },
          wait_for_selector: {
            type: 'string',
            description: 'Sayfanın hazır kabul edilmesi için beklenecek CSS seçicisi (örn: .product-list, #main-content)'
          },
          scroll_to_bottom: {
            type: 'boolean',
            description: 'Sonsuz kaydırma (infinite scroll) sayfalarında tüm içeriği yüklemek için aşağı kaydırma yapılsın mı'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_structured_data',
      description: 'HTML veya metin içeriğinden CSS/XPath veya AI çıkarıcılar ile yapısal veri tablosu (JSON) üretir.',
      parameters: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description: 'Veri çıkarılacak ham HTML içeriği'
          },
          item_selector: {
            type: 'string',
            description: 'Her bir veri satırını/kartını temsil eden kapsayıcı CSS seçicisi (örn: .product-card, tr.data-row)'
          },
          fields: {
            type: 'array',
            description: 'Çıkarılacak alanların listesi',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Alan adı (örn: title, price, rating, url)' },
                selector: { type: 'string', description: 'İlgili alanın CSS seçicisi (örn: h2.title, span.price-value)' },
                attribute: { type: 'string', description: 'Alınacak HTML niteliği (text, href, src vb.)' },
                type: { type: 'string', description: 'Veri tipi (string, number, boolean)' }
              },
              required: ['name']
            }
          }
        },
        required: ['html', 'fields']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'export_dataset',
      description: 'Çıkarılan yapısal verileri JSON veya CSV formatına dönüştürüp arayüzde önizleme tablosu ve indirme linki oluşturur.',
      parameters: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            description: 'Dışa aktarılacak veri nesneleri dizisi'
          },
          format: {
            type: 'string',
            description: 'Dışa aktarım formatı',
            enum: ['json', 'csv']
          },
          filename: {
            type: 'string',
            description: 'Oluşturulacak dosya adı (uzantısız)'
          }
        },
        required: ['data', 'format']
      }
    }
  }
];
