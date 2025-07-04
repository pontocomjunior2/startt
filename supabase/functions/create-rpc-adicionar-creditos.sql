-- Função RPC para adicionar créditos por pacote
-- Esta função é chamada pelo webhook do Mercado Pago quando um pagamento é aprovado

CREATE OR REPLACE FUNCTION adicionar_creditos_por_pacote(
  p_user_id UUID,
  p_pacote_id UUID,
  p_pagamento_id_externo TEXT,
  p_metodo_pagamento TEXT DEFAULT 'mercado_pago'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pacote_creditos INTEGER;
  v_pacote_validade_dias INTEGER;
  v_data_validade TIMESTAMP WITH TIME ZONE;
  v_result JSON;
BEGIN
  -- 1. Buscar informações do pacote
  SELECT creditos_oferecidos, validade_dias 
  INTO v_pacote_creditos, v_pacote_validade_dias
  FROM pacotes
  WHERE id = p_pacote_id AND ativo = true;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Pacote não encontrado ou inativo',
      'pacote_id', p_pacote_id
    );
  END IF;

  -- 2. Calcular data de validade
  IF v_pacote_validade_dias IS NOT NULL AND v_pacote_validade_dias > 0 THEN
    v_data_validade := NOW() + (v_pacote_validade_dias || ' days')::INTERVAL;
  ELSE
    v_data_validade := NULL; -- Sem validade
  END IF;

  -- 3. Inserir lote de créditos
  INSERT INTO lotes_creditos (
    user_id,
    pacote_id,
    quantidade_adicionada,
    quantidade_usada,
    data_validade,
    status,
    admin_id_que_adicionou,
    observacao_admin
  ) VALUES (
    p_user_id,
    p_pacote_id,
    v_pacote_creditos,
    0,
    v_data_validade,
    'ativo',
    NULL,
    'Créditos adicionados por compra de pacote: ' || p_pacote_id || ' (Pagamento: ' || p_pagamento_id_externo || ')'
  );

  -- 4. Retornar resultado
  v_result := json_build_object(
    'success', true,
    'user_id', p_user_id,
    'pacote_id', p_pacote_id,
    'creditos_adicionados', v_pacote_creditos,
    'data_validade', v_data_validade,
    'pagamento_id', p_pagamento_id_externo,
    'metodo_pagamento', p_metodo_pagamento
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Erro interno: ' || SQLERRM,
      'user_id', p_user_id,
      'pacote_id', p_pacote_id
    );
END;
$$;

-- Função RPC para subtrair créditos (usado pelos admins)
CREATE OR REPLACE FUNCTION admin_subtrair_creditos(
  p_user_id UUID,
  p_quantidade INTEGER,
  p_observacao TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_creditos_disponiveis INTEGER;
  v_lotes_para_debitar RECORD;
  v_quantidade_restante INTEGER;
  v_quantidade_a_debitar INTEGER;
BEGIN
  -- 1. Verificar se o chamador é admin
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Acesso negado.');
  END IF;

  -- 2. Verificar créditos disponíveis
  SELECT COALESCE(SUM(quantidade_adicionada - quantidade_usada), 0)
  INTO v_creditos_disponiveis
  FROM lotes_creditos
  WHERE user_id = p_user_id 
    AND status = 'ativo'
    AND (data_validade IS NULL OR data_validade > NOW());

  -- VALIDAÇÃO CORRIGIDA E MELHORADA
  IF v_creditos_disponiveis < p_quantidade THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Não foi possível subtrair os créditos.',
      'message', 'Você tentou remover ' || p_quantidade || ' crédito(s), mas o usuário possui apenas ' || v_creditos_disponiveis || ' válido(s).'
    );
  END IF;

  -- 3. Debitar créditos dos lotes (lógica mantida)
  v_quantidade_restante := p_quantidade;
  FOR v_lotes_para_debitar IN
    SELECT id, quantidade_adicionada, quantidade_usada
    FROM lotes_creditos
    WHERE user_id = p_user_id 
      AND status = 'ativo'
      AND (data_validade IS NULL OR data_validade > NOW())
      AND quantidade_adicionada > quantidade_usada
    ORDER BY 
      CASE WHEN data_validade IS NULL THEN '2099-12-31'::timestamp ELSE data_validade END ASC,
      data_adicao ASC
  LOOP
    v_quantidade_a_debitar := LEAST(v_quantidade_restante, v_lotes_para_debitar.quantidade_adicionada - v_lotes_para_debitar.quantidade_usada);
    UPDATE lotes_creditos
    SET 
      quantidade_usada = quantidade_usada + v_quantidade_a_debitar,
      observacao_admin = COALESCE(observacao_admin, '') || ' | Débito Admin: ' || v_quantidade_a_debitar || ' por ' || p_observacao
    WHERE id = v_lotes_para_debitar.id;
    v_quantidade_restante := v_quantidade_restante - v_quantidade_a_debitar;
    EXIT WHEN v_quantidade_restante <= 0;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', p_quantidade || ' crédito(s) foram debitados com sucesso.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Erro interno: ' || SQLERRM);
END;
$$;

-- Função para obter total de créditos ativos (usar se necessário)
CREATE OR REPLACE FUNCTION get_total_creditos_ativos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantidade_adicionada - quantidade_usada), 0)
  INTO v_total
  FROM lotes_creditos
  WHERE status = 'ativo'
    AND (data_validade IS NULL OR data_validade > NOW());
    
  RETURN v_total;
END;
$$;

-- Permitir acesso anônimo às funções RPC (ajustar conforme RLS)
GRANT EXECUTE ON FUNCTION adicionar_creditos_por_pacote(UUID, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_subtrair_creditos(UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_total_creditos_ativos() TO anon, authenticated, service_role; 