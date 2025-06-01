document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('messagesForm');
    const responseMessageDiv = document.getElementById('responseMessage');

    // Campos de input único
    const statusClosedInput = document.getElementById('status_closed');
    const statusOpeningSoonInput = document.getElementById('status_openingSoon');
    const statusOpenInput = document.getElementById('status_open');
    const extrasSundayNightInput = document.getElementById('extras_sundayNight');
    const extrasFridayInput = document.getElementById('extras_friday');

    // Campos de textarea (múltiplas mensagens)
    const newMemberTextarea = document.getElementById('newMember');
    const memberLeftTextarea = document.getElementById('memberLeft');
    const randomActiveTextarea = document.getElementById('randomActive');

    async function loadMessages() {
        try {
            const response = await fetch('/admin/api/messages');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const messages = await response.json();

            // Preencher campos de status
            if (messages.status) {
                statusClosedInput.value = messages.status.closed || '';
                statusOpeningSoonInput.value = messages.status.openingSoon || '';
                statusOpenInput.value = messages.status.open || '';
            }

            // Preencher textareas
            newMemberTextarea.value = Array.isArray(messages.newMember) ? messages.newMember.join('\n') : '';
            memberLeftTextarea.value = Array.isArray(messages.memberLeft) ? messages.memberLeft.join('\n') : '';
            randomActiveTextarea.value = Array.isArray(messages.randomActive) ? messages.randomActive.join('\n') : '';
            
            // Preencher campos extras
            if (messages.extras) {
                extrasSundayNightInput.value = messages.extras.sundayNight || '';
                extrasFridayInput.value = messages.extras.friday || '';
            }

        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            responseMessageDiv.textContent = 'Erro ao carregar mensagens do servidor.';
            responseMessageDiv.className = 'error';
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        responseMessageDiv.textContent = '';
        responseMessageDiv.className = '';

        const updatedMessages = {
            status: {
                closed: statusClosedInput.value.trim(),
                openingSoon: statusOpeningSoonInput.value.trim(),
                open: statusOpenInput.value.trim(),
            },
            newMember: newMemberTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            memberLeft: memberLeftTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            randomActive: randomActiveTextarea.value.split('\n').map(s => s.trim()).filter(s => s),
            extras: {
                sundayNight: extrasSundayNightInput.value.trim(),
                friday: extrasFridayInput.value.trim(),
            }
        };

        try {
            const response = await fetch('/admin/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedMessages),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                responseMessageDiv.textContent = result.message || 'Mensagens salvas com sucesso!';
                responseMessageDiv.className = 'success';
            } else {
                throw new Error(result.message || 'Falha ao salvar mensagens.');
            }
        } catch (error) {
            console.error('Erro ao salvar mensagens:', error);
            responseMessageDiv.textContent = `Erro ao salvar: ${error.message}`;
            responseMessageDiv.className = 'error';
        }
    });

    // Carregar mensagens quando a página for carregada
    loadMessages();
}); 