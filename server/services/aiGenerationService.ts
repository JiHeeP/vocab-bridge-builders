/**
 * AI generation service using Kimi 2.5 (Moonshot AI)
 * Generates meanings and example sentences for Korean vocabulary
 * at elementary school 2nd grade level.
 */

interface GeneratedVocab {
  word: string;
  meaning: string;
  example: string;
}

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_MODEL = "kimi-k2";

function getApiKey(): string {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!key) {
    throw new Error("KIMI_API_KEY 또는 MOONSHOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

export async function generateVocabDefinitions(words: string[]): Promise<GeneratedVocab[]> {
  if (words.length === 0) return [];

  const apiKey = getApiKey();
  const wordList = words.map((w, i) => `${i + 1}. ${w}`).join("\n");

  const prompt = `당신은 초등학교 2학년 학생을 위한 한국어 어휘 학습 도우미입니다.
아래 어휘들의 뜻과 예문을 초등학교 2학년 수준으로 쉽게 만들어주세요.

규칙:
- 뜻: 초등학교 2학년이 이해할 수 있는 쉬운 말로 설명 (1~2문장)
- 예문: 초등학교 2학년이 일상에서 쓸 수 있는 자연스러운 문장 1개
- 반드시 JSON 배열로 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

어휘 목록:
${wordList}

응답 형식 (JSON 배열만 출력):
[{"word":"어휘1","meaning":"쉬운 뜻","example":"예문"},{"word":"어휘2","meaning":"쉬운 뜻","example":"예문"}]`;

  const response = await fetch(KIMI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API 호출 실패 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Kimi API에서 빈 응답을 받았습니다.");
  }

  // Extract JSON from potential markdown code blocks
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as GeneratedVocab[];
    if (!Array.isArray(parsed)) {
      throw new Error("응답이 배열이 아닙니다.");
    }
    return parsed.map((item) => ({
      word: String(item.word ?? ""),
      meaning: String(item.meaning ?? ""),
      example: String(item.example ?? ""),
    }));
  } catch (parseError) {
    throw new Error(`AI 응답 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}\n원본: ${content.slice(0, 500)}`);
  }
}
