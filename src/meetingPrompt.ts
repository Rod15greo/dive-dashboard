export interface MeetingOutput {
  titulo: string;
  data: string;
  tipo_reuniao: string;
  participantes: string[];
  resumo_executivo: string;
  contexto_e_objetivo: string;
  principais_pontos: Array<{
    tema: string;
    discussao: string;
    conclusao: string;
  }>;
  decisoes_tomadas: Array<{
    decisao: string;
    responsavel: string | null;
    contexto: string;
  }>;
  pontos_de_atencao: Array<{
    ponto: string;
    levantado_por: string;
    impacto: string;
  }>;
  proximas_acoes: Array<{
    acao: string;
    responsavel: string;
    prazo: string;
    contexto: string;
  }>;
  pendencias_em_aberto: string[];
  pauta_proxima_reuniao: string[];
  observacoes: string | null;
}

export function buildSystemPrompt(): string {
  return `Você é especialista em gestão de projetos e responsável por transformar transcrições de reuniões em atas executivas detalhadas.

Gere um JSON válido com exatamente esta estrutura:

{
  "titulo": "string — nome descritivo da reunião",
  "data": "string — DD/MM/AAAA",
  "tipo_reuniao": "string — ex: Alinhamento de UX, Sprint Review, etc.",
  "participantes": ["lista de nomes identificados na transcrição"],
  "resumo_executivo": "string — 4 a 6 frases cobrindo TODOS os temas centrais discutidos. Não repita o resumo do Fireflies. Sintetize a partir da transcrição.",
  "contexto_e_objetivo": "string — por que essa reunião aconteceu, qual era o objetivo declarado ou implícito, o que estava pendente da reunião anterior.",
  "principais_pontos": [
    {
      "tema": "string — nome do tópico",
      "discussao": "string — 3 a 6 frases descrevendo O QUE foi discutido, quais perspectivas foram levantadas, quais dúvidas surgiram. Cite participantes pelo nome quando relevante.",
      "conclusao": "string — qual foi o encaminhamento ou status desse ponto"
    }
  ],
  "decisoes_tomadas": [
    {
      "decisao": "string — o que foi decidido, de forma clara e direta",
      "responsavel": "string ou null",
      "contexto": "string — por que essa decisão foi tomada"
    }
  ],
  "pontos_de_atencao": [
    {
      "ponto": "string — risco, dúvida em aberto, preocupação levantada",
      "levantado_por": "string — quem trouxe",
      "impacto": "string — qual área ou entrega pode ser afetada"
    }
  ],
  "proximas_acoes": [
    {
      "acao": "string — descrição clara e acionável da tarefa",
      "responsavel": "string",
      "prazo": "string ou 'não definido'",
      "contexto": "string — de onde veio essa ação, qual decisão originou"
    }
  ],
  "pendencias_em_aberto": [
    "string — itens que foram discutidos mas NÃO chegaram a uma conclusão ou decisão nesta reunião"
  ],
  "pauta_proxima_reuniao": [
    "string — item concreto que precisa ser retomado ou decidido"
  ],
  "observacoes": "string ou null — qualquer contexto técnico, organizacional ou de processo relevante para quem ler a ata depois"
}

Regras obrigatórias:
- Use a transcrição completa como fonte principal, não os bullets do resumo
- Cite participantes pelo nome (ex: "Anders propôs...", "TJ reforçou que...")
- Seja específico: evite frases genéricas como "a equipe discutiu X". Diga o que foi discutido sobre X.
- Se um ponto ficou sem conclusão, registre em pendencias_em_aberto
- Identifique pontos de atenção mesmo que não tenham sido explicitamente sinalizados como risco — se alguém expressou preocupação, registre
- "principais_pontos" deve ter no mínimo 6 itens para reuniões acima de 30 minutos
- Retorne APENAS o JSON, sem markdown, sem texto fora do JSON`;
}

export function buildUserPrompt(transcript: FirefliesTranscript): string {
  const shortSummary = transcript.summary?.short_summary ?? '';
  const actionItems  = transcript.summary?.action_items ?? '';

  const MAX_SENTENCES = 800;
  const sentences = (transcript.sentences ?? [])
    .slice(0, MAX_SENTENCES)
    .map(s => `[${s.speaker_name}]: ${s.text}`)
    .join('\n');

  const truncated = (transcript.sentences ?? []).length > MAX_SENTENCES
    ? `\n[... transcrição truncada após ${MAX_SENTENCES} falas ...]`
    : '';

  return `Reunião: ${transcript.title}
Data: ${transcript.dateString}
Duração: ${transcript.duration} minutos
Participantes declarados: ${(transcript.participants ?? []).join(', ')}

=== RESUMO NARRATIVO DO FIREFLIES ===
${shortSummary}

=== AÇÕES E RESPONSÁVEIS IDENTIFICADOS PELO FIREFLIES ===
${actionItems}

=== TRANSCRIÇÃO COMPLETA ===
${sentences}${truncated}

Use o resumo narrativo e os action items como orientação estrutural, mas baseie os detalhes da ata na transcrição completa. Identifique os participantes pelos padrões de fala e pelos nomes mencionados.`;
}

export interface FirefliesTranscript {
  id: string;
  title: string;
  dateString: string;
  duration: number;
  participants: string[];
  organizer_email: string;
  meeting_link: string;
  transcript_url: string;
  speakers: Array<{ id: string; name: string }>;
  sentences: Array<{
    index: number;
    speaker_name: string;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  summary: {
    gist: string;
    bullet_gist: string;
    overview: string;
    short_summary: string;
    action_items: string;
    keywords: string[];
  };
}
