document.addEventListener('DOMContentLoaded', () => {
    // Formulários
    const configForm = document.getElementById('configForm');
    const messagesForm = document.getElementById('messagesForm');
    const promptsForm = document.getElementById('promptsForm'); // Novo formulário

    // Mensagens de resposta
    const responseMessageConfig = document.getElementById('responseMessageConfig');
    const responseMessageMessages = document.getElementById('responseMessageMessages');
    const responseMessagePrompts = document.getElementById('responseMessagePrompts'); // Nova div de resposta

    // Formulário de Mensagens
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

    // Novo campo para gameTips
    const gameTipsTextarea = document.getElementById('gameTips');

    // Novo campo para Piadas
    const randomJokesTextarea = document.getElementById('randomJokes');

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
    const aiPromptRandomJokeTextarea = document.getElementById('aiPrompt_randomJoke'); // prompt para piadas

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
    const aiUsageMessageDeletedCheckbox = document.getElementById('aiUsage_messageDeleted');
    const aiUsageRandomJokeCheckbox = document.getElementById('aiUsage_randomJoke'); // checkbox para piadas

    // Formulário de Configurações Gerais
    const responseMessageGlobalDiv = document.getElementById('responseMessageGlobal');

    // Novos elementos para substituir todas as mensagens via JSON
    const replaceAllMessagesJsonTextarea = document.getElementById('replaceAllMessagesJson');
    const replaceAllMessagesBtn = document.getElementById('replaceAllMessagesBtn');
    const responseMessageReplaceAllDiv = document.getElementById('responseMessageReplaceAll');
    const replaceAllSpinner = document.getElementById('replaceAllSpinner');

    // Novos elementos para gerenciamento de histórico de chat
    const loadDbChatHistoryBtn = document.getElementById('loadDbChatHistoryBtn');
    const dbChatHistorySpinner = document.getElementById('dbChatHistorySpinner');
    const dbChatHistoryTextarea = document.getElementById('dbChatHistoryTextarea');
    const simulateSummaryBtn = document.getElementById('simulateSummaryBtn');
    const simulateSummarySpinner = document.getElementById('simulateSummarySpinner');
    const simulatedSummaryResult = document.getElementById('simulatedSummaryResult');
    const clearDbChatHistoryBtn = document.getElementById('clearDbChatHistoryBtn');
    const clearDbChatHistorySpinner = document.getElementById('clearDbChatHistorySpinner');
    const responseMessageChatHistoryDiv = document.getElementById('responseMessageChatHistory');

    // Novos elementos para "Mensagem Apagada"
    const messageDeletedTextarea = document.getElementById('messageDeleted');
    const aiPromptMessageDeletedTextarea = document.getElementById('aiPrompt_messageDeleted');

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
        // Auto-hide after 5 seconds
        setTimeout(() => {
            div.classList.add('hidden');
        }, 5000);
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
            if (gameTipsTextarea && messages.gameTips) {
                gameTipsTextarea.value = Array.isArray(messages.gameTips) ? messages.gameTips.join('\n') : '';
            }
            if (randomJokesTextarea && messages.randomJokes) {
                randomJokesTextarea.value = Array.isArray(messages.randomJokes) ? messages.randomJokes.join('\n') : '';
            }

            // Carregar mensagens de "Mensagem Apagada"
            if (messageDeletedTextarea && messages.messageDeleted) {
                messageDeletedTextarea.value = Array.isArray(messages.messageDeleted) ? messages.messageDeleted.join('\n') : (messages.messageDeleted || '');
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
                if (aiPromptMessageDeletedTextarea && messages.aiPrompts.messageDeleted !== undefined) aiPromptMessageDeletedTextarea.value = messages.aiPrompts.messageDeleted;
                if (aiPromptRandomJokeTextarea && messages.aiPrompts.randomJoke !== undefined) aiPromptRandomJokeTextarea.value = messages.aiPrompts.randomJoke;
            }

            // Carregar configurações de uso da IA
            const defaultAiUsage = {
                status_closed: false, status_openingSoon: false, status_open: false,
                newMember: false, memberLeft: false, randomActive: true, inGameRandom: true,
                extras_sundayNight: false, extras_friday: false,
                messageDeleted: true, randomJoke: true
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
            if (aiUsageMessageDeletedCheckbox) aiUsageMessageDeletedCheckbox.checked = currentAiUsage.messageDeleted !== undefined ? currentAiUsage.messageDeleted : defaultAiUsage.messageDeleted;
            if (aiUsageRandomJokeCheckbox) aiUsageRandomJokeCheckbox.checked = currentAiUsage.randomJoke !== undefined ? currentAiUsage.randomJoke : defaultAiUsage.randomJoke;

        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            responseMessageMessagesDiv.textContent = 'Erro ao carregar mensagens do servidor.';
            responseMessageMessagesDiv.className = 'response-message error';
        }
    }

    async function loadConfig() {
        try {
            const response = await fetch('/admin/api/config');
            const result = await response.json();
            if (response.ok && result.success && result.config) {
                const config = result.config;
                console.log("Admin.js: Configurações carregadas do backend:", JSON.stringify(config, null, 2));
                
                // Populate form fields
                for (const key in config) {
                    if (Object.prototype.hasOwnProperty.call(config, key)) {
                        const inputElement = document.getElementById(`config_${key}`);
                        if (inputElement) {
                            if (inputElement.type === 'checkbox') {
                                inputElement.checked = !!config[key]; // Converte para booleano
                            } else if (key === 'CHAT_SUMMARY_TIMES' && Array.isArray(config[key])) {
                                inputElement.value = config[key].join(',');
                            } else {
                                inputElement.value = config[key] === null || config[key] === undefined ? '' : config[key];
                            }
                        } else {
                            // console.warn(`loadConfig: Elemento de formulário não encontrado para config_${key}`);
                        }
                    }
                }
            } else {
                throw new Error(result.message || 'Falha ao carregar configurações gerais do backend.');
            }
        } catch (error) {
            console.error('Erro ao carregar configurações gerais:', error);
            showGlobalMessage(`Erro ao carregar configurações: ${error.message}`, true);
        }
    }

    if (messagesForm) {
        messagesForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const dataToSave = {
                status: {
                    closed: statusClosedInput.value.split('\n').map(s => s.trim()).filter(Boolean),
                    openingSoon: statusOpeningSoonInput.value.split('\n').map(s => s.trim()).filter(Boolean),
                    open: statusOpenInput.value.split('\n').map(s => s.trim()).filter(Boolean)
                },
                newMember: newMemberTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                memberLeft: memberLeftTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                randomActive: randomActiveTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                inGameRandom: inGameRandomTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                gameTips: gameTipsTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                randomJokes: randomJokesTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                messageDeleted: messageDeletedTextarea.value.split('\n').map(s => s.trim()).filter(Boolean),
                extras: {
                    sundayNight: extrasSundayNightInput.value.split('\n').map(s => s.trim()).filter(Boolean),
                    friday: extrasFridayInput.value.split('\n').map(s => s.trim()).filter(Boolean)
                },
                aiUsageSettings: {
                    status_closed: aiUsageStatusClosedCheckbox.checked,
                    status_openingSoon: aiUsageStatusOpeningSoonCheckbox.checked,
                    status_open: aiUsageStatusOpenCheckbox.checked,
                    newMember: aiUsageNewMemberCheckbox.checked,
                    memberLeft: aiUsageMemberLeftCheckbox.checked,
                    randomActive: aiUsageRandomActiveCheckbox.checked,
                    inGameRandom: aiUsageInGameRandomCheckbox.checked,
                    extras_sundayNight: aiUsageExtrasSundayNightCheckbox.checked,
                    extras_friday: aiUsageExtrasFridayCheckbox.checked,
                    messageDeleted: aiUsageMessageDeletedCheckbox.checked,
                    randomJoke: aiUsageRandomJokeCheckbox.checked
                }
            };
            try {
                const response = await fetch('/api/admin/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataToSave)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showGlobalMessage('Mensagens e configurações de uso da IA salvas!', false, responseMessageMessages);
            } catch (error) {
                showGlobalMessage(`Erro ao salvar: ${error.message}`, true, responseMessageMessages);
            }
        });
    }

    if (promptsForm) {
        promptsForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const dataToSave = {
                aiPrompts: {
                    systemPrompt: aiPromptSystemPromptTextarea.value.trim(),
                    randomActive: aiPromptRandomActiveTextarea.value.trim(),
                    inGameRandom: aiPromptInGameRandomTextarea.value.trim(),
                    chatSummary: aiPromptChatSummaryTextarea.value.trim(),
                    status_closed: aiPromptStatusClosedTextarea.value.trim(),
                    status_openingSoon: aiPromptStatusOpeningSoonTextarea.value.trim(),
                    status_open: aiPromptStatusOpenTextarea.value.trim(),
                    newMember: aiPromptNewMemberTextarea.value.trim(),
                    memberLeft: aiPromptMemberLeftTextarea.value.trim(),
                    extras_sundayNight: aiPromptExtrasSundayNightTextarea.value.trim(),
                    extras_friday: aiPromptExtrasFridayTextarea.value.trim(),
                    messageDeleted: aiPromptMessageDeletedTextarea.value.trim(),
                    randomJoke: aiPromptRandomJokeTextarea.value.trim()
                }
            };
            try {
                const response = await fetch('/api/admin/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataToSave)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showGlobalMessage('Prompts da IA salvos com sucesso!', false, responseMessagePrompts);
            } catch (error) {
                showGlobalMessage(`Erro ao salvar prompts: ${error.message}`, true, responseMessagePrompts);
            }
        });
    }

    // Função genérica para lidar com cliques nos botões de gerar IA
    async function handleGenerateAIMessageClick(event) {
        const button = event.target;
        const messageType = button.dataset.messageType; // e.g., "status_closed", "newMember", "randomActive"
        
        console.log(`[DEBUG] Gerando mensagem IA para tipo: ${messageType}`);
        
        // Mapeamento de tipos de mensagem para IDs de elementos
        const typeToElementId = {
            'randomJoke': 'randomJokes',
            'gameTip': 'gameTips',
            // Adicione outros mapeamentos especiais aqui se necessário
        };
        
        // Determinar o elemento alvo com base no tipo de mensagem
        let targetElement;
        if (typeToElementId[messageType]) {
            // Usar o mapeamento especial se existir
            targetElement = document.getElementById(typeToElementId[messageType]);
            console.log(`[DEBUG] Usando mapeamento especial para ${messageType}: elemento ${typeToElementId[messageType]} ${targetElement ? 'encontrado' : 'não encontrado'}`);
        } else {
            // Caso contrário, tentar usar o tipo diretamente como ID
            targetElement = document.getElementById(messageType);
            console.log(`[DEBUG] Usando ID padrão para ${messageType}: ${targetElement ? 'encontrado' : 'não encontrado'}`);
        }
        
        // Buscar o spinner correspondente
        const spinner = document.getElementById(`aiSpinner_${messageType}`) || 
                        (messageType === 'randomActive' ? aiMessageSpinner : null) || 
                        (messageType === 'inGameRandom' ? aiMessageSpinnerInGameRandom : null);

        if (!targetElement) {
            console.error(`Elemento alvo não encontrado para messageType: ${messageType}`);
            alert(`Erro: Elemento para ${messageType} não encontrado. Por favor, recarregue a página.`);
            return;
        }
        
        if (!spinner) {
            console.warn(`Spinner não encontrado para messageType: ${messageType}, continuando sem animação de carregamento`);
        }
        
        const actualSpinner = spinner || (messageType === 'randomActive' ? aiMessageSpinner : aiMessageSpinnerInGameRandom);

        if (actualSpinner) actualSpinner.style.display = 'inline-block';
        button.disabled = true;
        responseMessageMessagesDiv.textContent = '';
        responseMessageMessagesDiv.className = 'response-message';

        try {
            console.log(`[DEBUG] Enviando requisição para gerar mensagem IA do tipo: ${messageType}`);
            const response = await fetch('/admin/api/generate-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: messageType }) // Envia o tipo de mensagem
            });
            const result = await response.json();
            console.log(`[DEBUG] Resposta recebida para ${messageType}:`, result);

            if (response.ok && result.success && result.message) {
                if (targetElement.tagName === 'TEXTAREA') {
                    const currentMessages = targetElement.value.trim();
                    targetElement.value = currentMessages ? `${currentMessages}\n${result.message}` : result.message;
                    console.log(`[DEBUG] Mensagem adicionada ao textarea para ${messageType}`);
                } else if (targetElement.tagName === 'INPUT') {
                    targetElement.value = result.message; // Substitui o conteúdo para inputs
                    console.log(`[DEBUG] Mensagem definida no input para ${messageType}`);
                }
                showGlobalMessage(`Mensagem IA (${messageType}) gerada! Não se esqueça de salvar.`);
            } else {
                throw new Error(result.message || `Falha ao gerar mensagem IA (${messageType}).`);
            }
        } catch (error) {
            console.error(`Erro ao gerar mensagem IA (${messageType}):`, error);
            responseMessageMessagesDiv.textContent = `Erro IA (${messageType}): ${error.message}`;
            responseMessageMessagesDiv.className = 'response-message error';
            alert(`Erro ao gerar mensagem IA: ${error.message}`);
        } finally {
            if (actualSpinner) actualSpinner.style.display = 'none';
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

    // Lógica para substituir todas as mensagens via JSON
    if (replaceAllMessagesBtn) {
        replaceAllMessagesBtn.addEventListener('click', async () => {
            const jsonContent = replaceAllMessagesJsonTextarea.value;
            responseMessageReplaceAllDiv.classList.add('hidden');
            replaceAllSpinner.classList.remove('hidden');
            replaceAllMessagesBtn.disabled = true;

            if (!jsonContent.trim()) {
                showFormMessage(responseMessageReplaceAllDiv, 'O campo JSON não pode estar vazio.', true);
                replaceAllSpinner.classList.add('hidden');
                replaceAllMessagesBtn.disabled = false;
                return;
            }

            let parsedJson;
            try {
                parsedJson = JSON.parse(jsonContent);
            } catch (error) {
                showFormMessage(responseMessageReplaceAllDiv, `Erro ao parsear JSON: ${error.message}`, true);
                replaceAllSpinner.classList.add('hidden');
                replaceAllMessagesBtn.disabled = false;
                return;
            }

            if (typeof parsedJson !== 'object' || parsedJson === null) {
                showFormMessage(responseMessageReplaceAllDiv, 'O conteúdo fornecido não é um objeto JSON válido.', true);
                replaceAllSpinner.classList.add('hidden');
                replaceAllMessagesBtn.disabled = false;
                return;
            }

            try {
                const response = await fetch('/admin/api/messages/replace-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsedJson), // Envia o JSON parseado
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    showGlobalMessage(result.message || 'Todas as mensagens e prompts foram substituídos com sucesso no banco de dados! Recarregando dados...');
                    replaceAllMessagesJsonTextarea.value = ''; // Limpa o textarea
                    await loadMessages(); // Recarrega as mensagens no painel para refletir as mudanças
                } else {
                    throw new Error(result.message || 'Falha ao substituir mensagens no banco de dados.');
                }
            } catch (error) {
                console.error('Erro ao substituir mensagens:', error);
                showFormMessage(responseMessageReplaceAllDiv, `Erro: ${error.message}`, true);
            } finally {
                replaceAllSpinner.classList.add('hidden');
                replaceAllMessagesBtn.disabled = false;
            }
        });
    }

    // Funções para o gerenciamento de histórico de chat
    if (loadDbChatHistoryBtn) {
        loadDbChatHistoryBtn.addEventListener('click', async () => {
            dbChatHistorySpinner.style.display = 'inline-block';
            loadDbChatHistoryBtn.disabled = true;
            dbChatHistoryTextarea.value = '';
            simulatedSummaryResult.value = '';
            responseMessageChatHistoryDiv.textContent = '';
            responseMessageChatHistoryDiv.className = 'response-message';

            try {
                const response = await fetch('/admin/api/chat-history-db');
                const result = await response.json();

                if (response.ok && result.success) {
                    if (result.history && result.history.length > 0) {
                        const formattedHistory = result.history.map(msg => {
                            const date = new Date(msg.timestamp).toLocaleString('pt-BR');
                            return `[${date}] ${msg.sender}: ${msg.text}`;
                        }).join('\n');
                        dbChatHistoryTextarea.value = formattedHistory;
                        showFormMessage(responseMessageChatHistoryDiv, `Histórico carregado com ${result.history.length} mensagens.`, false);
                    } else {
                        dbChatHistoryTextarea.value = 'Nenhuma mensagem no histórico do banco de dados.';
                        showFormMessage(responseMessageChatHistoryDiv, 'Nenhum histórico de chat encontrado no banco de dados.', false);
                    }
                } else {
                    throw new Error(result.message || 'Falha ao carregar histórico do chat.');
                }
            } catch (error) {
                console.error('Erro ao carregar histórico do chat:', error);
                showFormMessage(responseMessageChatHistoryDiv, `Erro ao carregar histórico: ${error.message}`, true);
            } finally {
                dbChatHistorySpinner.style.display = 'none';
                loadDbChatHistoryBtn.disabled = false;
            }
        });
    }

    if (simulateSummaryBtn) {
        simulateSummaryBtn.addEventListener('click', async () => {
            simulateSummarySpinner.style.display = 'inline-block';
            simulateSummaryBtn.disabled = true;
            simulatedSummaryResult.value = '';
            responseMessageChatHistoryDiv.textContent = '';
            responseMessageChatHistoryDiv.className = 'response-message';

            // Validação: verifica se há algo no textarea para simular (opcional, pois o backend usará o DB)
            // Poderia ser uma chamada direta sem depender do textarea, se a ideia é simular o estado atual do DB.
            // Para este exemplo, vamos assumir que o backend sempre pega o estado atual do DB.

            try {
                const response = await fetch('/admin/api/simulate-chat-summary-db', { method: 'POST' });
                const result = await response.json();

                if (response.ok && result.success) {
                    simulatedSummaryResult.value = result.summary || "Nenhum resumo gerado (histórico vazio ou IA falhou).";
                    showFormMessage(responseMessageChatHistoryDiv, 'Simulação de resumo concluída.', false);
                } else {
                    throw new Error(result.message || 'Falha ao simular resumo do chat.');
                }
            } catch (error) {
                console.error('Erro ao simular resumo:', error);
                simulatedSummaryResult.value = `Erro: ${error.message}`;
                showFormMessage(responseMessageChatHistoryDiv, `Erro na simulação: ${error.message}`, true);
            } finally {
                simulateSummarySpinner.style.display = 'none';
                simulateSummaryBtn.disabled = false;
            }
        });
    }

    if (clearDbChatHistoryBtn) {
        clearDbChatHistoryBtn.addEventListener('click', async () => {
            if (!confirm('Tem certeza que deseja apagar TODO o histórico de chat do banco de dados? Esta ação é irreversível.')) {
                return;
            }

            clearDbChatHistorySpinner.style.display = 'inline-block';
            clearDbChatHistoryBtn.disabled = true;
            responseMessageChatHistoryDiv.textContent = '';
            responseMessageChatHistoryDiv.className = 'response-message';

            try {
                const response = await fetch('/admin/api/clear-chat-history-db', { method: 'POST' });
                const result = await response.json();

                if (response.ok && result.success) {
                    dbChatHistoryTextarea.value = 'Histórico de chat limpo.';
                    simulatedSummaryResult.value = '';
                    showFormMessage(responseMessageChatHistoryDiv, result.message || 'Histórico de chat do banco de dados limpo com sucesso!', false);
                } else {
                    throw new Error(result.message || 'Falha ao limpar o histórico do chat.');
                }
            } catch (error) {
                console.error('Erro ao limpar histórico do chat:', error);
                showFormMessage(responseMessageChatHistoryDiv, `Erro ao limpar histórico: ${error.message}`, true);
            } finally {
                clearDbChatHistorySpinner.style.display = 'none';
                clearDbChatHistoryBtn.disabled = false;
            }
        });
    }

    // Carregar dados iniciais
    loadMessages();
    loadConfig();
}); 