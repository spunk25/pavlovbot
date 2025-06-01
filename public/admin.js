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

    // Seletores para os textareas dos prompts de IA
    const aiPromptRandomActiveTextarea = document.getElementById('aiPrompt_randomActive');
    const aiPromptInGameRandomTextarea = document.getElementById('aiPrompt_inGameRandom');
    const aiPromptChatSummaryTextarea = document.getElementById('aiPrompt_chatSummary');
    const aiPromptStatusClosedTextarea = document.getElementById('aiPrompt_status_closed');
    const aiPromptStatusOpeningSoonTextarea = document.getElementById('aiPrompt_status_openingSoon');
    const aiPromptStatusOpenTextarea = document.getElementById('aiPrompt_status_open');
    const aiPromptNewMemberTextarea = document.getElementById('aiPrompt_newMember');
    const aiPromptMemberLeftTextarea = document.getElementById('aiPrompt_memberLeft');
    const aiPromptExtrasSundayNightTextarea = document.getElementById('aiPrompt_extras_sundayNight');
    const aiPromptExtrasFridayTextarea = document.getElementById('aiPrompt_extras_friday');
    const aiPromptSystemPromptTextarea = document.getElementById('aiPrompt_systemPrompt');

    // Seletores para os checkboxes de uso da IA
    const aiUsageStatusClosedCheckbox = document.getElementById('aiUsage_status_closed');
    const aiUsageStatusOpeningSoonCheckbox = document.getElementById('aiUsage_status_openingSoon');
    const aiUsageStatusOpenCheckbox = document.getElementById('aiUsage_status_open');
    const aiUsageNewMemberCheckbox = document.getElementById('aiUsage_newMember');
    const aiUsageMemberLeftCheckbox = document.getElementById('aiUsage_memberLeft');
    const aiUsageRandomActiveCheckbox = document.getElementById('aiUsage_randomActive');
    const aiUsageInGameRandomCheckbox = document.getElementById('aiUsage_inGameRandom');
    const aiUsageExtrasSundayNightCheckbox = document.getElementById('aiUsage_extras_sundayNight');
    const aiUsageExtrasFridayCheckbox = document.getElementById('aiUsage_extras_friday');

    // Formulário de Configurações Gerais
    const configForm = document.getElementById('configForm');
    const responseMessageConfigDiv = document.getElementById('responseMessageConfig');
    const configEvolutionApiUrlInput = document.getElementById('config_EVOLUTION_API_URL');
    const configInstanceNameInput = document.getElementById('config_INSTANCE_NAME');
    const configEvolutionApiKeyInput = document.getElementById('config_EVOLUTION_API_KEY');
    const configGroqApiKeyInput = document.getElementById('config_GROQ_API_KEY');
    const configTargetGroupIdInput = document.getElementById('config_TARGET_GROUP_ID');
    const configGroupBaseNameInput = document.getElementById('config_GROUP_BASE_NAME');
    const configServerOpenTimeInput = document.getElementById('config_SERVER_OPEN_TIME');
    const configServerCloseTimeInput = document.getElementById('config_SERVER_CLOSE_TIME');
    const configTimezoneInput = document.getElementById('config_TIMEZONE');
    const configMessagesDuringServerOpenInput = document.getElementById('config_MESSAGES_DURING_SERVER_OPEN');
    const configMessagesDuringDaytimeInput = document.getElementById('config_MESSAGES_DURING_DAYTIME');
    const configDaytimeStartHourInput = document.getElementById('config_DAYTIME_START_HOUR');
    const configDaytimeEndHourInput = document.getElementById('config_DAYTIME_END_HOUR');
    const configChatSummaryTimesInput = document.getElementById('config_CHAT_SUMMARY_TIMES');
    const configBotWebhookPortInput = document.getElementById('config_BOT_WEBHOOK_PORT');
    const configBotPublicUrlInput = document.getElementById('config_BOT_PUBLIC_URL');
    const configChatSummaryCountPerDayInput = document.getElementById('config_CHAT_SUMMARY_COUNT_PER_DAY');

    const responseMessageGlobalDiv = document.getElementById('responseMessageGlobal');

    // --- EXTENDED DEBUGGING ---
    console.log("--- Checking Config Input Elements ---");
    console.log("configEvolutionApiUrlInput:", configEvolutionApiUrlInput);
    console.log("configInstanceNameInput:", configInstanceNameInput);
    console.log("configEvolutionApiKeyInput:", configEvolutionApiKeyInput);
    console.log("configGroqApiKeyInput:", configGroqApiKeyInput);
    console.log("configTargetGroupIdInput:", configTargetGroupIdInput);
    console.log("configGroupBaseNameInput:", configGroupBaseNameInput);
    console.log("configServerOpenTimeInput:", configServerOpenTimeInput);
    console.log("configServerCloseTimeInput:", configServerCloseTimeInput);
    console.log("configTimezoneInput:", configTimezoneInput);
    console.log("configMessagesDuringServerOpenInput:", configMessagesDuringServerOpenInput);
    console.log("configMessagesDuringDaytimeInput:", configMessagesDuringDaytimeInput);
    console.log("configDaytimeStartHourInput:", configDaytimeStartHourInput);
    console.log("configDaytimeEndHourInput:", configDaytimeEndHourInput); // Previous specific debug
    console.log("configChatSummaryTimesInput:", configChatSummaryTimesInput);
    console.log("configBotWebhookPortInput:", configBotWebhookPortInput);
    console.log("configBotPublicUrlInput:", configBotPublicUrlInput);
    console.log("configChatSummaryCountPerDayInput:", configChatSummaryCountPerDayInput);
    console.log("--- End Checking Config Input Elements ---");
    // --- END EXTENDED DEBUGGING ---

    function showGlobalMessage(message, isError = false) {
        responseMessageGlobalDiv.textContent = message;
        responseMessageGlobalDiv.className = `mb-4 p-3 rounded-md text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
        responseMessageGlobalDiv.classList.remove('hidden');
        setTimeout(() => {
            responseMessageGlobalDiv.classList.add('hidden');
        }, 5000);
    }
    
    function showFormMessage(div, message, isError = false) {
        div.textContent = message;
        div.className = `mt-4 p-3 rounded-md text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
        div.classList.remove('hidden');
    }
    
    function toggleSpinner(spinnerId, show) {
        const spinner = document.getElementById(spinnerId);
        if (spinner) {
            spinner.classList.toggle('hidden', !show);
        }
    }

    async function loadMessages() {
        try {
            const response = await fetch('/admin/api/messages');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const messages = await response.json();

            if (messages.status) {
                statusClosedInput.value = Array.isArray(messages.status.closed) ? messages.status.closed.join('\n') : (messages.status.closed || '');
                statusOpeningSoonInput.value = Array.isArray(messages.status.openingSoon) ? messages.status.openingSoon.join('\n') : (messages.status.openingSoon || '');
                statusOpenInput.value = Array.isArray(messages.status.open) ? messages.status.open.join('\n') : (messages.status.open || '');
            }
            newMemberTextarea.value = Array.isArray(messages.newMember) ? messages.newMember.join('\n') : '';
            memberLeftTextarea.value = Array.isArray(messages.memberLeft) ? messages.memberLeft.join('\n') : '';
            randomActiveTextarea.value = Array.isArray(messages.randomActive) ? messages.randomActive.join('\n') : '';
            inGameRandomTextarea.value = Array.isArray(messages.inGameRandom) ? messages.inGameRandom.join('\n') : '';
            if (messages.extras) {
                extrasSundayNightInput.value = Array.isArray(messages.extras.sundayNight) ? messages.extras.sundayNight.join('\n') : (messages.extras.sundayNight || '');
                extrasFridayInput.value = Array.isArray(messages.extras.friday) ? messages.extras.friday.join('\n') : (messages.extras.friday || '');
            }

            // Carregar prompts da IA
            if (messages.aiPrompts) {
                if (aiPromptSystemPromptTextarea && messages.aiPrompts.systemPrompt !== undefined) aiPromptSystemPromptTextarea.value = messages.aiPrompts.systemPrompt;
                if (aiPromptRandomActiveTextarea && messages.aiPrompts.randomActive !== undefined) aiPromptRandomActiveTextarea.value = messages.aiPrompts.randomActive;
                if (aiPromptInGameRandomTextarea && messages.aiPrompts.inGameRandom !== undefined) aiPromptInGameRandomTextarea.value = messages.aiPrompts.inGameRandom;
                if (aiPromptChatSummaryTextarea && messages.aiPrompts.chatSummary !== undefined) aiPromptChatSummaryTextarea.value = messages.aiPrompts.chatSummary;
                if (aiPromptStatusClosedTextarea && messages.aiPrompts.status_closed !== undefined) aiPromptStatusClosedTextarea.value = messages.aiPrompts.status_closed;
                if (aiPromptStatusOpeningSoonTextarea && messages.aiPrompts.status_openingSoon !== undefined) aiPromptStatusOpeningSoonTextarea.value = messages.aiPrompts.status_openingSoon;
                if (aiPromptStatusOpenTextarea && messages.aiPrompts.status_open !== undefined) aiPromptStatusOpenTextarea.value = messages.aiPrompts.status_open;
                if (aiPromptNewMemberTextarea && messages.aiPrompts.newMember !== undefined) aiPromptNewMemberTextarea.value = messages.aiPrompts.newMember;
                if (aiPromptMemberLeftTextarea && messages.aiPrompts.memberLeft !== undefined) aiPromptMemberLeftTextarea.value = messages.aiPrompts.memberLeft;
                if (aiPromptExtrasSundayNightTextarea && messages.aiPrompts.extras_sundayNight !== undefined) aiPromptExtrasSundayNightTextarea.value = messages.aiPrompts.extras_sundayNight;
                if (aiPromptExtrasFridayTextarea && messages.aiPrompts.extras_friday !== undefined) aiPromptExtrasFridayTextarea.value = messages.aiPrompts.extras_friday;
            }

            // Carregar configurações de uso da IA
            const defaultAiUsage = { // Padrões caso não existam no messages.json
                status_closed: false, status_openingSoon: false, status_open: false,
                newMember: false, memberLeft: false,
                randomActive: true, inGameRandom: true,
                extras_sundayNight: false, extras_friday: false
            };
            const currentAiUsage = messages.aiUsageSettings || defaultAiUsage;

            if (aiUsageStatusClosedCheckbox) aiUsageStatusClosedCheckbox.checked = currentAiUsage.status_closed !== undefined ? currentAiUsage.status_closed : defaultAiUsage.status_closed;
            if (aiUsageStatusOpeningSoonCheckbox) aiUsageStatusOpeningSoonCheckbox.checked = currentAiUsage.status_openingSoon !== undefined ? currentAiUsage.status_openingSoon : defaultAiUsage.status_openingSoon;
            if (aiUsageStatusOpenCheckbox) aiUsageStatusOpenCheckbox.checked = currentAiUsage.status_open !== undefined ? currentAiUsage.status_open : defaultAiUsage.status_open;
            if (aiUsageNewMemberCheckbox) aiUsageNewMemberCheckbox.checked = currentAiUsage.newMember !== undefined ? currentAiUsage.newMember : defaultAiUsage.newMember;
            if (aiUsageMemberLeftCheckbox) aiUsageMemberLeftCheckbox.checked = currentAiUsage.memberLeft !== undefined ? currentAiUsage.memberLeft : defaultAiUsage.memberLeft;
            if (aiUsageRandomActiveCheckbox) aiUsageRandomActiveCheckbox.checked = currentAiUsage.randomActive !== undefined ? currentAiUsage.randomActive : defaultAiUsage.randomActive;
            if (aiUsageInGameRandomCheckbox) aiUsageInGameRandomCheckbox.checked = currentAiUsage.inGameRandom !== undefined ? currentAiUsage.inGameRandom : defaultAiUsage.inGameRandom;
            if (aiUsageExtrasSundayNightCheckbox) aiUsageExtrasSundayNightCheckbox.checked = currentAiUsage.extras_sundayNight !== undefined ? currentAiUsage.extras_sundayNight : defaultAiUsage.extras_sundayNight;
            if (aiUsageExtrasFridayCheckbox) aiUsageExtrasFridayCheckbox.checked = currentAiUsage.extras_friday !== undefined ? currentAiUsage.extras_friday : defaultAiUsage.extras_friday;

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

            if (configEvolutionApiUrlInput) configEvolutionApiUrlInput.value = config.EVOLUTION_API_URL || '';
            if (configInstanceNameInput) configInstanceNameInput.value = config.INSTANCE_NAME || '';
            if (configEvolutionApiKeyInput) configEvolutionApiKeyInput.value = config.EVOLUTION_API_KEY || '';
            if (configGroqApiKeyInput) configGroqApiKeyInput.value = config.GROQ_API_KEY || '';
            if (configTargetGroupIdInput) configTargetGroupIdInput.value = config.TARGET_GROUP_ID || '';
            if (configGroupBaseNameInput) configGroupBaseNameInput.value = config.GROUP_BASE_NAME || '';
            if (configServerOpenTimeInput) configServerOpenTimeInput.value = config.SERVER_OPEN_TIME || '19:00';
            if (configServerCloseTimeInput) configServerCloseTimeInput.value = config.SERVER_CLOSE_TIME || '23:59';
            if (configTimezoneInput) configTimezoneInput.value = config.TIMEZONE || 'America/Sao_Paulo';
            if (configMessagesDuringServerOpenInput) configMessagesDuringServerOpenInput.value = config.MESSAGES_DURING_SERVER_OPEN == null ? 0 : config.MESSAGES_DURING_SERVER_OPEN;
            if (configMessagesDuringDaytimeInput) configMessagesDuringDaytimeInput.value = config.MESSAGES_DURING_DAYTIME == null ? 0 : config.MESSAGES_DURING_DAYTIME;
            if (configDaytimeStartHourInput) configDaytimeStartHourInput.value = config.DAYTIME_START_HOUR == null ? 0 : config.DAYTIME_START_HOUR;
            if (configDaytimeEndHourInput) configDaytimeEndHourInput.value = config.DAYTIME_END_HOUR == null ? 0 : config.DAYTIME_END_HOUR;
            if (configChatSummaryTimesInput) configChatSummaryTimesInput.value = Array.isArray(config.CHAT_SUMMARY_TIMES) ? config.CHAT_SUMMARY_TIMES.join(',') : '';
            if (configBotWebhookPortInput) configBotWebhookPortInput.value = config.BOT_WEBHOOK_PORT || 8080;
            if (configBotPublicUrlInput) configBotPublicUrlInput.value = config.BOT_PUBLIC_URL || '';
            if (configChatSummaryCountPerDayInput) configChatSummaryCountPerDayInput.value = config.CHAT_SUMMARY_COUNT_PER_DAY == null ? 3 : config.CHAT_SUMMARY_COUNT_PER_DAY;

        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            responseMessageConfigDiv.textContent = 'Erro ao carregar configurações do servidor. Verifique o console do bot e do navegador.';
            responseMessageConfigDiv.className = 'mt-4 p-3 rounded-md text-center bg-red-100 text-red-700';
            responseMessageConfigDiv.classList.remove('hidden');
        }
    }

    messagesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        responseMessageMessagesDiv.textContent = '';
        responseMessageMessagesDiv.className = 'response-message';

        const updatedMessages = {
            status: {
                closed: statusClosedInput.value.split('\n').map(s => s.trim()).filter(s => s),
                openingSoon: statusOpeningSoonInput.value.split('\n').map(s => s.trim()).filter(s => s),
                open: statusOpenInput.value.split('\n').map(s => s.trim()).filter(s => s),
            },
            newMember: newMemberTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            memberLeft: memberLeftTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            randomActive: randomActiveTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            inGameRandom: inGameRandomTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            extras: {
                sundayNight: extrasSundayNightInput.value.split('\n').map(s => s.trim()).filter(s => s),
                friday: extrasFridayInput.value.split('\n').map(s => s.trim()).filter(s => s),
            },
            aiPrompts: {
                systemPrompt: aiPromptSystemPromptTextarea ? aiPromptSystemPromptTextarea.value.trim() : '',
                randomActive: aiPromptRandomActiveTextarea ? aiPromptRandomActiveTextarea.value.trim() : '',
                inGameRandom: aiPromptInGameRandomTextarea ? aiPromptInGameRandomTextarea.value.trim() : '',
                chatSummary: aiPromptChatSummaryTextarea ? aiPromptChatSummaryTextarea.value.trim() : '',
                status_closed: aiPromptStatusClosedTextarea ? aiPromptStatusClosedTextarea.value.trim() : '',
                status_openingSoon: aiPromptStatusOpeningSoonTextarea ? aiPromptStatusOpeningSoonTextarea.value.trim() : '',
                status_open: aiPromptStatusOpenTextarea ? aiPromptStatusOpenTextarea.value.trim() : '',
                newMember: aiPromptNewMemberTextarea ? aiPromptNewMemberTextarea.value.trim() : '',
                memberLeft: aiPromptMemberLeftTextarea ? aiPromptMemberLeftTextarea.value.trim() : '',
                extras_sundayNight: aiPromptExtrasSundayNightTextarea ? aiPromptExtrasSundayNightTextarea.value.trim() : '',
                extras_friday: aiPromptExtrasFridayTextarea ? aiPromptExtrasFridayTextarea.value.trim() : ''
            },
            aiUsageSettings: {
                status_closed: aiUsageStatusClosedCheckbox ? aiUsageStatusClosedCheckbox.checked : false,
                status_openingSoon: aiUsageStatusOpeningSoonCheckbox ? aiUsageStatusOpeningSoonCheckbox.checked : false,
                status_open: aiUsageStatusOpenCheckbox ? aiUsageStatusOpenCheckbox.checked : false,
                newMember: aiUsageNewMemberCheckbox ? aiUsageNewMemberCheckbox.checked : false,
                memberLeft: aiUsageMemberLeftCheckbox ? aiUsageMemberLeftCheckbox.checked : false,
                randomActive: aiUsageRandomActiveCheckbox ? aiUsageRandomActiveCheckbox.checked : true, // Default true
                inGameRandom: aiUsageInGameRandomCheckbox ? aiUsageInGameRandomCheckbox.checked : true, // Default true
                extras_sundayNight: aiUsageExtrasSundayNightCheckbox ? aiUsageExtrasSundayNightCheckbox.checked : false,
                extras_friday: aiUsageExtrasFridayCheckbox ? aiUsageExtrasFridayCheckbox.checked : false
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
        responseMessageConfigDiv.classList.add('hidden');
        responseMessageConfigDiv.textContent = '';

        const updatedConfig = {           
            TARGET_GROUP_ID: configTargetGroupIdInput.value.trim(),
            GROUP_BASE_NAME: configGroupBaseNameInput.value.trim(),
            SERVER_OPEN_TIME: configServerOpenTimeInput.value,
            SERVER_CLOSE_TIME: configServerCloseTimeInput.value,
            MESSAGES_DURING_SERVER_OPEN: parseInt(configMessagesDuringServerOpenInput.value, 10),
            MESSAGES_DURING_DAYTIME: parseInt(configMessagesDuringDaytimeInput.value, 10),
            DAYTIME_START_HOUR: parseInt(configDaytimeStartHourInput.value, 10),
            DAYTIME_END_HOUR: parseInt(configDaytimeEndHourInput.value, 10),
            CHAT_SUMMARY_TIMES: configChatSummaryTimesInput.value.trim(),
            CHAT_SUMMARY_COUNT_PER_DAY: parseInt(configChatSummaryCountPerDayInput.value, 10)
        };
        
        let validationError = false;
        if (updatedConfig.DAYTIME_START_HOUR < 0 || updatedConfig.DAYTIME_START_HOUR > 23 ||
            updatedConfig.DAYTIME_END_HOUR < 0 || updatedConfig.DAYTIME_END_HOUR > 23) {
            showFormMessage(responseMessageConfigDiv, 'Hora diurna deve ser entre 0 e 23.', true);
            validationError = true;
        }
        if (updatedConfig.MESSAGES_DURING_SERVER_OPEN < 0 || updatedConfig.MESSAGES_DURING_DAYTIME < 0) {
            showFormMessage(responseMessageConfigDiv, 'Quantidade de mensagens não pode ser negativa.', true);
            validationError = true;
        }
        if (isNaN(updatedConfig.BOT_WEBHOOK_PORT) || updatedConfig.BOT_WEBHOOK_PORT < 1024 || updatedConfig.BOT_WEBHOOK_PORT > 65535) {
            showFormMessage(responseMessageConfigDiv, 'Porta do Webhook deve ser um número entre 1024 e 65535.', true);
            validationError = true;
        }
        if (validationError) return;

        try {
            const response = await fetch('/admin/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                showGlobalMessage(result.message || 'Configurações salvas com sucesso!');
                loadConfig();
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