import axios from 'axios';

let currentConfig;
let messageServiceRef; // To get system prompt

function initialize(config, msgService) {
  currentConfig = config;
  messageServiceRef = msgService;
  console.log("GroqApiService: Inicializado.");
}

async function callGroqAPI(userPrompt, model = "llama3-70b-8192") {
  if (!currentConfig || !currentConfig.GROQ_API_KEY) {
    console.error("GroqApiService: GROQ_API_KEY não configurada.");
    return "Erro: Chave da API Groq não configurada no servidor.";
  }
  if (!messageServiceRef) {
    console.error("GroqApiService: MessageService não referenciado.");
    return "Erro: Configuração interna do bot (MessageService).";
  }

  const systemPrompt = messageServiceRef.getSystemPrompt();

  try {
    const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: model, // e.g., "mixtral-8x7b-32768" or "llama2-70b-4096"
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${currentConfig.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (groqResponse.data.choices && groqResponse.data.choices.length > 0) {
      return groqResponse.data.choices[0].message.content.trim();
    }
    return "Não foi possível gerar uma mensagem da IA (resposta vazia).";
  } catch (error) {
    console.error("GroqApiService: Erro ao chamar API Groq:", error.response ? error.response.data : error.message);
    return `Erro ao contatar a IA: ${error.message}`;
  }
}

export default {
  initialize,
  callGroqAPI
}; 