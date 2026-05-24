export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
}

async function sendWhatsAppMessage(to, message) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.error('[WHATSAPP] Missing ACCESS_TOKEN or PHONE_NUMBER_ID');
        return;
    }

    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: message },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('[WHATSAPP] Meta API error:', response.status, errorBody);
            return;
        }

        const data = await response.json();
        console.log('[WHATSAPP] Message sent successfully:', data.messages?.[0]?.id ?? 'unknown');
    } catch (error) {
        console.error('[WHATSAPP] Network failure sending message:', error);
    }
}

export async function POST(req) {
    try {
        const body = await req.json();

        const entries = body?.entry;
        if (!entries || !Array.isArray(entries)) {
            return Response.json({ received: true });
        }

        for (const entry of entries) {
            const changes = entry?.changes;
            if (!changes || !Array.isArray(changes)) continue;

            for (const change of changes) {
                const value = change?.value;
                if (!value) continue;

                const messages = value?.messages;
                if (!messages || !Array.isArray(messages)) continue;

                for (const msg of messages) {
                    if (msg?.type !== 'text') continue;

                    const sender = msg.from;
                    const text = msg?.text?.body;
                    const msgId = msg.id;

                    console.log('[WHATSAPP] Incoming text:', { sender, text, msgId });

                    await sendWhatsAppMessage(sender, 'Hello from Shri Balaji Dental Clinic bot.');
                }
            }
        }

        return Response.json({ received: true });
    } catch (error) {
        console.error('[WHATSAPP] Webhook error:', error);
        return Response.json({ received: true });
    }
}
