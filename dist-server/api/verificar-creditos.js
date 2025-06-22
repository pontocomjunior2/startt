"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'userId é obrigatório' });
    }
    try {
        console.log(`🔍 [VERIFICACAO] Consultando créditos do usuário ${userId}`);
        // Buscar dados do usuário diretamente do banco
        const { data: profile, error: profileError } = await supabaseAdmin_1.supabaseAdmin
            .from('profiles')
            .select('id, email, credits, updated_at')
            .eq('id', userId)
            .single();
        if (profileError) {
            console.error("❌ [VERIFICACAO] Erro ao buscar usuário:", profileError);
            throw new Error('Usuário não encontrado.');
        }
        console.log(`💰 [VERIFICACAO] Dados encontrados:`, {
            email: profile.email,
            credits: profile.credits,
            updated_at: profile.updated_at
        });
        // Buscar histórico de lotes de créditos (se existir)
        const { data: lotes, error: lotesError } = await supabaseAdmin_1.supabaseAdmin
            .from('lotes_creditos')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);
        if (lotesError) {
            console.warn("⚠️ [VERIFICACAO] Erro ao buscar lotes:", lotesError);
        }
        else {
            console.log(`📋 [VERIFICACAO] Últimos lotes:`, lotes);
        }
        return res.status(200).json({
            success: true,
            message: 'Verificação concluída',
            user: {
                id: profile.id,
                email: profile.email,
                credits: profile.credits,
                updated_at: profile.updated_at
            },
            lotes: lotes || [],
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('💥 [VERIFICACAO] Erro:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
//# sourceMappingURL=verificar-creditos.js.map