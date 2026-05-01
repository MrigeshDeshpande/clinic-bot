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

export async function POST(req) {
    try {
        const body = await req.json();
        
        if (body.object) {
            if (
                body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0] &&
                body.entry[0].changes[0].value.messages &&
                body.entry[0].changes[0].value.messages[0]
            ) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const type = message.type;

                console.log(`\n[WHATSAPP] Incoming ${type} from ${from}`);

                if (type === 'text') {
                    console.log(`Content: "${message.text.body}"`);
                } else if (type === 'image') {
                    console.log(`Image ID: ${message.image.id}`);
                }
            } else {
                console.log('Received webhook event:', JSON.stringify(body, null, 2));
            }
        }

        return new Response('Event received', { status: 200 });
    } catch (error) {
        console.error('Webhook Error:', error);
        return new Response('Error processing event', { status: 500 });
    }
}
