document.addEventListener('DOMContentLoaded', () => {
    // Formulário de Mensagens
    const messagesForm = document.getElementById('messagesForm');
    const responseMessageMessagesDiv = document.getElementById('responseMessageMessages');
    const statusClosedInput = document.getElementById('status_closed');
    const statusOpeningSoonInput = document.getElementById('status_openingSoon');
    const statusOpenInput = document.getElementById('status_open');
    const extrasSundayNightInput = document.getElementById('extras_sundayNight');
    const extrasFridayInput = document.getElementById('extras_friday');
    const newMemberTextarea = document.getElementById('newMember');
    const memberLeftTextarea = document.getElementById('memberLeft');
    const randomActiveTextarea = document.getElementById('randomActive');
    const generateAIMessageBtn = document.getElementById('generateAIMessageBtn');
    const aiMessageSpinner = document.getElementById('aiMessageSpinner');

    // Novos campos para inGameRandom
    const inGameRandomTextarea = document.getElementById('inGameRandom');
    const generateAIInGameMessageBtn = document.getElementById('generateAIInGameMessageBtn');
    const aiMessageSpinnerInGameRandom = document.getElementById('aiMessageSpinnerInGameRandom');

    // Formulário de Configurações Gerais
    const configForm = document.getElementById('configForm');
    const responseMessageConfigDiv = document.getElementById('responseMessageConfig');
    const configGroupBaseNameInput = document.getElementById('config_GROUP_BASE_NAME');
    const configServerOpenTimeInput = document.getElementById('config_SERVER_OPEN_TIME');
    const configServerCloseTimeInput = document.getElementById('config_SERVER_CLOSE_TIME');
    const configMessagesDuringServerOpenInput = document.getElementById('config_MESSAGES_DURING_SERVER_OPEN');
    const configMessagesDuringDaytimeInput = document.getElementById('config_MESSAGES_DURING_DAYTIME');
    const configDaytimeStartHourInput = document.getElementById('config_DAYTIME_START_HOUR');
    const configDaytimeEndHourInput = document.getElementById('config_DAYTIME_END_HOUR');
    // const configGroqApiKeyInput = document.getElementById('config_GROQ_API_KEY'); // Se for usar

    const responseMessageGlobalDiv = document.getElementById('responseMessageGlobal');


    function showGlobalMessage(message, type = 'success') {
        responseMessageGlobalDiv.textContent = message;
        responseMessageGlobalDiv.className = `response-message ${type}`;
        setTimeout(() => {
            responseMessageGlobalDiv.textContent = '';
            responseMessageGlobalDiv.className = 'response-message';
        }, 5000);
    }
    
    async function loadMessages() {
        try {
            const response = await fetch('/admin/api/messages');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const messages = await response.json();

            if (messages.status) {
                statusClosedInput.value = messages.status.closed || '';
                statusOpeningSoonInput.value = messages.status.openingSoon || '';
                statusOpenInput.value = messages.status.open || '';
            }
            newMemberTextarea.value = Array.isArray(messages.newMember) ? messages.newMember.join('\n') : '';
            memberLeftTextarea.value = Array.isArray(messages.memberLeft) ? messages.memberLeft.join('\n') : '';
            randomActiveTextarea.value = Array.isArray(messages.randomActive) ? messages.randomActive.join('\n') : '';
            inGameRandomTextarea.value = Array.isArray(messages.inGameRandom) ? messages.inGameRandom.join('\n') : '';
            if (messages.extras) {
                extrasSundayNightInput.value = messages.extras.sundayNight || '';
                extrasFridayInput.value = messages.extras.friday || '';
            }
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            responseMessageMessagesDiv.textContent = 'Erro ao carregar mensagens do servidor.';
            responseMessageMessagesDiv.className = 'response-message error';
        }
    }

    async function loadConfig() {
        try {
            const response = await fetch('/admin/api/config');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const config = await response.json();

            configGroupBaseNameInput.value = config.GROUP_BASE_NAME || '';
            configServerOpenTimeInput.value = config.SERVER_OPEN_TIME || '19:00';
            configServerCloseTimeInput.value = config.SERVER_CLOSE_TIME || '23:59';
            configMessagesDuringServerOpenInput.value = config.MESSAGES_DURING_SERVER_OPEN || 4;
            configMessagesDuringDaytimeInput.value = config.MESSAGES_DURING_DAYTIME || 4;
            configDaytimeStartHourInput.value = config.DAYTIME_START_HOUR || 8;
            configDaytimeEndHourInput.value = config.DAYTIME_END_HOUR || 17;
            // if (configGroqApiKeyInput) configGroqApiKeyInput.value = config.GROQ_API_KEY || '';

        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            responseMessageConfigDiv.textContent = 'Erro ao carregar configurações do servidor.';
            responseMessageConfigDiv.className = 'response-message error';
        }
    }

    messagesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        responseMessageMessagesDiv.textContent = '';
        responseMessageMessagesDiv.className = 'response-message';

        const updatedMessages = {
            status: {
                closed: statusClosedInput.value.trim(),
                openingSoon: statusOpeningSoonInput.value.trim(),
                open: statusOpenInput.value.trim(),
            },
            newMember: newMemberTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            memberLeft: memberLeftTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            randomActive: randomActiveTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            inGameRandom: inGameRandomTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            extras: {
                sundayNight: extrasSundayNightInput.value.trim(),
                friday: extrasFridayInput.value.trim(),
            }
        };

        try {
            const response = await fetch('/admin/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedMessages),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                showGlobalMessage(result.message || 'Mensagens salvas com sucesso!');
            } else {
                throw new Error(result.message || 'Falha ao salvar mensagens.');
            }
        } catch (error) {
            console.error('Erro ao salvar mensagens:', error);
            responseMessageMessagesDiv.textContent = `Erro ao salvar: ${error.message}`;
            responseMessageMessagesDiv.className = 'response-message error';
        }
    });

    configForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        responseMessageConfigDiv.textContent = '';
        responseMessageConfigDiv.className = 'response-message';

        const updatedConfig = {
            GROUP_BASE_NAME: configGroupBaseNameInput.value.trim(),
            SERVER_OPEN_TIME: configServerOpenTimeInput.value,
            SERVER_CLOSE_TIME: configServerCloseTimeInput.value,
            MESSAGES_DURING_SERVER_OPEN: parseInt(configMessagesDuringServerOpenInput.value, 10),
            MESSAGES_DURING_DAYTIME: parseInt(configMessagesDuringDaytimeInput.value, 10),
            DAYTIME_START_HOUR: parseInt(configDaytimeStartHourInput.value, 10),
            DAYTIME_END_HOUR: parseInt(configDaytimeEndHourInput.value, 10),
            // GROQ_API_KEY: configGroqApiKeyInput ? configGroqApiKeyInput.value.trim() : undefined
        };
        
        // Validar horas
        if (updatedConfig.DAYTIME_START_HOUR < 0 || updatedConfig.DAYTIME_START_HOUR > 23 ||
            updatedConfig.DAYTIME_END_HOUR < 0 || updatedConfig.DAYTIME_END_HOUR > 23) {
            responseMessageConfigDiv.textContent = 'Hora diurna deve ser entre 0 e 23.';
            responseMessageConfigDiv.className = 'response-message error';
            return;
        }
        if (updatedConfig.MESSAGES_DURING_SERVER_OPEN < 0 || updatedConfig.MESSAGES_DURING_DAYTIME < 0) {
             responseMessageConfigDiv.textContent = 'Quantidade de mensagens não pode ser negativa.';
            responseMessageConfigDiv.className = 'response-message error';
            return;
        }


        try {
            const response = await fetch('/admin/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                showGlobalMessage(result.message || 'Configurações salvas com sucesso!');
            } else {
                throw new Error(result.message || 'Falha ao salvar configurações.');
            }
        } catch (error) {
            console.error('Erro ao salvar configurações:', error);
            responseMessageConfigDiv.textContent = `Erro ao salvar: ${error.message}`;
            responseMessageConfigDiv.className = 'response-message error';
        }
    });

    // Função genérica para lidar com cliques nos botões de gerar IA
    async function handleGenerateAIMessageClick(event) {
        const button = event.target;
        const messageType = button.dataset.messageType; // e.g., "status_closed", "newMember", "randomActive"
        
        const targetElement = document.getElementById(messageType);
        const spinner = document.getElementById(`aiSpinner_${messageType}`) || 
                        (messageType === 'randomActive' ? aiMessageSpinner : null) || 
                        (messageType === 'inGameRandom' ? aiMessageSpinnerInGameRandom : null);

        if (!targetElement) {
            console.error(`Elemento alvo não encontrado para messageType: ${messageType}`);
            return;
        }
        if (!spinner) {
            console.error(`Spinner não encontrado para messageType: ${messageType}`);
            // Fallback para os spinners originais se os IDs dinâmicos não forem encontrados (para os botões já existentes)
            if (messageType === 'randomActive') {
                 // aiMessageSpinner já é o spinner correto
            } else if (messageType === 'inGameRandom') {
                // aiMessageSpinnerInGameRandom já é o spinner correto
            } else {
                return;
            }
        }
        
        const actualSpinner = spinner || (messageType === 'randomActive' ? aiMessageSpinner : aiMessageSpinnerInGameRandom);


        actualSpinner.style.display = 'inline-block';
        button.disabled = true;
        responseMessageMessagesDiv.textContent = '';
        responseMessageMessagesDiv.className = 'response-message';

        try {
            const response = await fetch('/admin/api/generate-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: messageType }) // Envia o tipo de mensagem
            });
            const result = await response.json();

            if (response.ok && result.success && result.message) {
                if (targetElement.tagName === 'TEXTAREA') {
                    const currentMessages = targetElement.value.trim();
                    targetElement.value = currentMessages ? `${currentMessages}\n${result.message}` : result.message;
                } else if (targetElement.tagName === 'INPUT') {
                    targetElement.value = result.message; // Substitui o conteúdo para inputs
                }
                showGlobalMessage(`Mensagem IA (${messageType}) gerada! Não se esqueça de salvar.`);
            } else {
                throw new Error(result.message || `Falha ao gerar mensagem IA (${messageType}).`);
            }
        } catch (error) {
            console.error(`Erro ao gerar mensagem IA (${messageType}):`, error);
            responseMessageMessagesDiv.textContent = `Erro IA (${messageType}): ${error.message}`;
            responseMessageMessagesDiv.className = 'response-message error';
        } finally {
            actualSpinner.style.display = 'none';
            button.disabled = false;
        }
    }

    generateAIMessageBtn.addEventListener('click', handleGenerateAIMessageClick);
    generateAIInGameMessageBtn.addEventListener('click', handleGenerateAIMessageClick);

    // Adicionar event listeners para todos os novos botões "Gerar com IA"
    const allAIGenerateButtons = document.querySelectorAll('.generate-ai-btn');
    allAIGenerateButtons.forEach(button => {
        // Os botões originais já têm listeners, então podemos verificar se já foi adicionado
        // ou simplesmente adicionar (não causará problemas se adicionado duas vezes para os mesmos)
        // No entanto, para evitar duplicidade, vamos garantir que os IDs originais não sejam re-adicionados aqui
        // se eles já foram pegos por getElementById.
        if (button.id !== 'generateAIMessageBtn' && button.id !== 'generateAIInGameMessageBtn') {
            button.addEventListener('click', handleGenerateAIMessageClick);
        }
    });

    // Carregar dados iniciais
    loadMessages();
    loadConfig();
}); 