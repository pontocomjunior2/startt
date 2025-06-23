"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gerarPagamentoPixMP = void 0;
const mercadopago_1 = require("mercadopago");
// ✅ CORREÇÃO: Tornando a busca do token mais robusta
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
if (!accessToken) {
    console.error("💥 [ERRO FATAL] Variável de ambiente MERCADOPAGO_ACCESS_TOKEN ou MP_ACCESS_TOKEN não foi definida.");
    throw new Error("Configuração do servidor incompleta: Chave de acesso do Mercado Pago não encontrada.");
}
const client = new mercadopago_1.MercadoPagoConfig({ accessToken });
const payment = new mercadopago_1.Payment(client);
function isValidHttpUrl(url) {
    if (!url)
        return false;
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    }
    catch (_a) {
        return false;
    }
}
const gerarPagamentoPixMP = async (req, res) => {
    var _a;
    try {
        const { pacoteNome, valorTotal, emailCliente, userIdCliente, pacoteId } = req.body;
        if (!pacoteNome || !valorTotal || !emailCliente || !userIdCliente || !pacoteId) {
            return res.status(400).json({ success: false, message: 'Dados obrigatórios ausentes (pacoteNome, valorTotal, emailCliente, userIdCliente, pacoteId).' });
        }
        const NOTIFICATION_URL = process.env.MP_NOTIFICATION_URL;
        if (!isValidHttpUrl(NOTIFICATION_URL)) {
            return res.status(400).json({ success: false, message: 'A variável de ambiente MP_NOTIFICATION_URL deve ser uma URL pública e válida (https://...).' });
        }
        const externalReference = `${userIdCliente}_${pacoteId}_${Date.now()}`;
        const expirationDate = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos
        const paymentData = {
            transaction_amount: valorTotal,
            description: `Compra de créditos STARTT - ${pacoteNome}`,
            payment_method_id: 'pix',
            payer: { email: emailCliente },
            notification_url: NOTIFICATION_URL,
            external_reference: externalReference,
            date_of_expiration: expirationDate,
            metadata: {
                user_id_cliente: userIdCliente,
                pacote_id: pacoteId,
                pacote_nome: pacoteNome
            },
        };
        console.log('📤 [MP SDK] Enviando criação de PIX para Mercado Pago...');
        const paymentResult = await payment.create({
            body: paymentData,
            requestOptions: {
                idempotencyKey: externalReference,
            },
        });
        console.log('📨 [MP SDK] Resposta do Mercado Pago:', {
            id: paymentResult.id,
            status: paymentResult.status,
            status_detail: paymentResult.status_detail
        });
        const txData = (_a = paymentResult.point_of_interaction) === null || _a === void 0 ? void 0 : _a.transaction_data;
        if (!(txData === null || txData === void 0 ? void 0 : txData.qr_code) || !(txData === null || txData === void 0 ? void 0 : txData.qr_code_base64)) {
            console.error('[MercadoPago] Falha ao obter chave Pix ou QR Code. Resposta completa:', JSON.stringify(paymentResult, null, 2));
            return res.status(500).json({
                success: false,
                message: 'QR Code do Pix gerado, mas a chave Pix Copia e Cola não foi encontrada na resposta do Mercado Pago. Verifique se a conta está habilitada para receber Pix.',
                details: paymentResult
            });
        }
        const tempoExpiracaoSegundos = Math.floor((new Date(paymentResult.date_of_expiration).getTime() - Date.now()) / 1000);
        return res.json({
            success: true,
            paymentId: paymentResult.id,
            qrCodeBase64: txData.qr_code_base64,
            qrCodePayload: txData.qr_code,
            tempoExpiracaoSegundos,
        });
    }
    catch (error) {
        console.error('💥 [ERRO PIX] Erro ao criar pagamento PIX:', {
            message: error.message,
            status: error.status,
            cause: error.cause
        });
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Erro ao criar pagamento Pix no Mercado Pago',
            details: error.cause
        });
    }
};
exports.gerarPagamentoPixMP = gerarPagamentoPixMP;
//# sourceMappingURL=gerar-pagamento-pix-mp.js.map