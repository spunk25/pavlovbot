import axios from 'axios';

let currentConfig;
let messageServiceRef; // To get system prompt

function initialize(config, msgService) {
  currentConfig = config;
  messageServiceRef = msgService;
  console.log("GroqApiService: Inicializado.");
}

async function callGroqAPI(userPrompt, model = "llama-3.3-70b-versatile") {
  console.log(`[DEBUG GroqAPI] Iniciando chamada para modelo ${model}`);
  console.log(`[DEBUG GroqAPI] Prompt do usuário: "${userPrompt?.substring(0, 100)}${userPrompt?.length > 100 ? '...' : ''}"`);

  if (!currentConfig || !currentConfig.GROQ_API_KEY) {
    console.error("GroqApiService: GROQ_API_KEY não configurada.");
    return "Erro: Chave da API Groq não configurada no servidor.";
  }
  if (!messageServiceRef) {
    console.error("GroqApiService: MessageService não referenciado.");
    return "Erro: Configuração interna do bot (MessageService).";
  }
  
  if (!userPrompt || userPrompt.trim() === "") {
    console.error("GroqApiService: Prompt do usuário vazio ou indefinido");
    return "Erro: Prompt do usuário vazio ou indefinido";
  }

  const systemPrompt = messageServiceRef.getSystemPrompt();
  console.log(`[DEBUG GroqAPI] System prompt: "${systemPrompt?.substring(0, 100)}${systemPrompt?.length > 100 ? '...' : ''}"`);

  try {
    console.log(`[DEBUG GroqAPI] Enviando requisição para https://api.groq.com/openai/v1/chat/completions...`);
    
    const startTime = Date.now();
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
      },
      timeout: 30000 // 30 segundos de timeout
    });
    
    const duration = Date.now() - startTime;
    console.log(`[DEBUG GroqAPI] Resposta recebida em ${duration}ms, status: ${groqResponse.status}`);

    if (groqResponse.data.choices && groqResponse.data.choices.length > 0) {
      const aiResponse = groqResponse.data.choices[0].message.content.trim();
      console.log(`[DEBUG GroqAPI] Resposta da IA: "${aiResponse.substring(0, 100)}${aiResponse.length > 100 ? '...' : ''}"`);
      return aiResponse;
    }
    
    console.error("GroqApiService: Resposta sem choices ou choices vazio", groqResponse.data);
    return "Não foi possível gerar uma mensagem da IA (resposta vazia).";
  } catch (error) {
    console.error("GroqApiService: Erro ao chamar API Groq:");
    
    if (error.response) {
      // A requisição foi feita e o servidor respondeu com um código de status que não está na faixa de 2xx
      console.error(`[DEBUG GroqAPI] Erro de resposta - status: ${error.response.status}`);
      console.error(`[DEBUG GroqAPI] Dados do erro:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // A requisição foi feita mas nenhuma resposta foi recebida
      console.error(`[DEBUG GroqAPI] Erro de requisição - sem resposta do servidor (timeout ou conexão recusada)`);
    } else {
      // Algo aconteceu na configuração da requisição que causou um erro
      console.error(`[DEBUG GroqAPI] Erro de configuração:`, error.message);
    }
    
    if (error.code === 'ECONNABORTED') {
      return `Erro de timeout ao contatar a IA (demorou muito para responder)`;
    }
    
    return `Erro ao contatar a IA: ${error.message}`;
  }
}

export default {
  initialize,
  callGroqAPI
}; 