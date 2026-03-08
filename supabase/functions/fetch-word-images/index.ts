import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function translateToEnglish(
  words: { word: string; meaning: string }[],
  apiKey: string
): Promise<Record<string, string>> {
  const prompt = words.map(w => `${w.word}: ${w.meaning}`).join('\n');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: `You are a translator. For each Korean vocabulary word and its meaning, provide a short English search query (1-3 words) that would find a relevant photo on Unsplash. Return ONLY a JSON object mapping Korean word to English query. Example: {"움직임": "body movement", "환경": "nature environment"}. No markdown, no explanation.`
        },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`AI translation failed [${res.status}]: ${text}`);
    throw new Error(`AI translation failed: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in AI response:', content);
    throw new Error('Invalid AI response format');
  }

  return JSON.parse(jsonMatch[0]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!UNSPLASH_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'UNSPLASH_ACCESS_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { words } = await req.json() as { words: { word: string; meaning: string }[] };

    if (!words || !Array.isArray(words) || words.length === 0) {
      return new Response(JSON.stringify({ error: 'words array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which words already have images
    const wordTexts = words.map(w => w.word);
    const { data: existing } = await supabase
      .from('word_images')
      .select('word')
      .in('word', wordTexts);

    const existingWords = new Set((existing || []).map(e => e.word));
    const missingWords = words.filter(w => !existingWords.has(w.word));

    if (missingWords.length === 0) {
      return new Response(JSON.stringify({
        results: wordTexts.map(w => ({ word: w, status: 'already_cached' })),
        total: words.length,
        fetched: 0,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Translate all missing words to English in one batch
    console.log(`Translating ${missingWords.length} words to English...`);
    let translations: Record<string, string> = {};
    
    // Batch translate in groups of 30 to avoid token limits
    for (let i = 0; i < missingWords.length; i += 30) {
      const batch = missingWords.slice(i, i + 30);
      const batchTranslations = await translateToEnglish(batch, LOVABLE_API_KEY);
      translations = { ...translations, ...batchTranslations };
    }

    console.log('Translations:', JSON.stringify(translations));

    const results: { word: string; status: string; query?: string }[] = [];

    // Fetch images using English search queries
    for (const { word } of missingWords) {
      const englishQuery = translations[word];
      if (!englishQuery) {
        results.push({ word, status: 'no_translation' });
        continue;
      }

      try {
        const query = encodeURIComponent(englishQuery);
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=squarish`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
        );

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Unsplash API error for "${word}" (query: "${englishQuery}"): ${res.status} ${errorText}`);
          results.push({ word, status: 'api_error', query: englishQuery });
          
          // If rate limited, stop processing
          if (res.status === 403 || res.status === 429) {
            console.error('Rate limited! Stopping further requests.');
            for (const remaining of missingWords.slice(missingWords.indexOf({ word } as any) + 1)) {
              results.push({ word: remaining.word, status: 'rate_limited' });
            }
            break;
          }
          continue;
        }

        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const photo = data.results[0];

          // Trigger download endpoint per Unsplash guidelines
          if (photo.links?.download_location) {
            fetch(`${photo.links.download_location}?client_id=${UNSPLASH_ACCESS_KEY}`).catch(() => {});
          }

          const { error: insertError } = await supabase.from('word_images').upsert({
            word,
            image_url: photo.urls.small,
            photographer_name: photo.user.name,
            photographer_url: photo.user.links.html,
            unsplash_url: photo.links.html,
          }, { onConflict: 'word' });

          if (insertError) {
            console.error(`DB insert error for "${word}":`, insertError);
            results.push({ word, status: 'db_error', query: englishQuery });
          } else {
            results.push({ word, status: 'fetched', query: englishQuery });
          }
        } else {
          results.push({ word, status: 'no_results', query: englishQuery });
        }

        // Rate limit: wait 300ms between requests (safe for 50/hr = ~1.2s apart, but we want some speed)
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Error processing "${word}":`, err);
        results.push({ word, status: 'error', query: englishQuery });
      }
    }

    // Add already-existing words
    for (const w of existingWords) {
      results.push({ word: w, status: 'already_cached' });
    }

    return new Response(JSON.stringify({
      results,
      total: words.length,
      fetched: results.filter(r => r.status === 'fetched').length,
      cached: existingWords.size,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
