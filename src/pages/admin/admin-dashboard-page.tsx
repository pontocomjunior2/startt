import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CreditCard, ListChecks, Loader2, FileText, Eye, Save, RotateCcw, RefreshCw, MessageSquare, DownloadCloud, MessageSquareWarning, FileAudio } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

// Importações para filtros
import { DatePickerSingle } from '@/components/ui/date-picker-single';
import { supabase } from '@/lib/supabaseClient'; // Para a query direta

// Hook e tipo customizado
import { useFetchAdminDashboardStats } from '../../hooks/queries/use-fetch-admin-dashboard-stats.hook';
import type { AdminDashboardStats } from '../../hooks/queries/use-fetch-admin-dashboard-stats.hook';

// Tipos atualizados
import type { AdminPedido, SolicitacaoRevisaoDetalhada } from '../../types/pedido.type';
import { PEDIDO_STATUS } from '../../types/pedido.type'; // Importação crucial
import { useUpdatePedidoStatus } from '../../hooks/mutations/use-update-pedido-status.hook';

// Actions para o novo fluxo de status do admin
import {
  adminMarcarPedidoEmAnaliseAction
  // adminIniciarGravacaoPedidoAction // Removido
} from '@/actions/pedido-actions';

// REMOVER HOOK PARA SOLICITAÇÕES DE REVISÃO
// import { useFetchAdminSolicitacoesRevisao } from '../../hooks/admin/use-fetch-admin-solicitacoes-revisao.hook';
import type { TipoRevisaoStatusAdmin } from '../../types/revisao.type';
import { REVISAO_STATUS_ADMIN } from '../../types/revisao.type';

// Novo Hook para o histórico detalhado de revisões de um pedido
import { useFetchSolicitacoesRevisaoDetalhadasPorPedido } from '../../hooks/queries/use-fetch-solicitacoes-revisao-detalhadas-por-pedido.hook';

// Action para processar revisão
import { processarRevisaoAdminAction } from '@/actions/revisao-actions';
import { useAction } from 'next-safe-action/hooks';

// Date-fns para formatação
import { format, endOfDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Novo hook para upload e update
import { useUploadPedidoAudio } from '../../hooks/mutations/use-upload-pedido-audio.hook';
import { useUpdatePedidoAudioAndStatus } from '../../hooks/mutations/use-update-pedido-audio-and-status.hook';

// Importar componentes de paginação do ShadCN de forma estática
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// Importar Tabs
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Importar AlertDialog e ícones
import { Trash2 } from 'lucide-react'; // Loader2 já importado

// Tipo para status de revisão que podem ser acionados pelo admin
type ActionableRevisaoStatusAdmin = Exclude<TipoRevisaoStatusAdmin, typeof REVISAO_STATUS_ADMIN.SOLICITADA>;

// Opções de status que o admin pode definir ao processar uma revisão
const ADMIN_REVISAO_ACTION_OPTIONS: { value: ActionableRevisaoStatusAdmin; label: string }[] = [
  { value: REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN, label: "Marcar como: Em Andamento (pelo Admin)" },
  { value: REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE, label: "Ação: Solicitar Mais Informações ao Cliente" },
  { value: REVISAO_STATUS_ADMIN.NEGADA, label: "Ação: Negar Solicitação de Revisão" },
  { value: REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO, label: "Ação: Enviar Áudio Revisado e Finalizar" },
];

import { useAuth } from '../../contexts/AuthContext';

function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  const { 
    data: stats, 
    isLoading: isLoadingStats, 
    isFetching: isFetchingStats,
    isError: isFetchStatsError, 
    error: fetchStatsError 
  } = useFetchAdminDashboardStats();

  // Estados para os pedidos paginados e loading (substituindo pedidosAdmin)
  const [pedidosExibidos, setPedidosExibidos] = useState<AdminPedido[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  
  // Estados para Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); 
  const [totalPedidosCount, setTotalPedidosCount] = useState(0);

  const [selectedPedido, setSelectedPedido] = useState<AdminPedido | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); // Modal principal do pedido
  
  const [currentPedidoStatus, setCurrentPedidoStatus] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUpdatingPedido, setIsUpdatingPedido] = useState(false);
  const [isProcessingAutoStatusChange, setIsProcessingAutoStatusChange] = useState(false); // Novo estado para a chamada automática

  // Novos estados para a aba de revisão
  const [activeRevisao, setActiveRevisao] = useState<SolicitacaoRevisaoDetalhada | null>(null);
  const [loadingRevisao, setLoadingRevisao] = useState(false);
  const [currentRevisaoAdminFeedback, setCurrentRevisaoAdminFeedback] = useState<string>("");
  const [revisaoAudioFile, setRevisaoAudioFile] = useState<File | null>(null);
  const [currentRevisaoModalStatus, setCurrentRevisaoModalStatus] = useState<TipoRevisaoStatusAdmin | undefined>(undefined);

  // Estado para controlar a aba ativa no modal
  const [modalActiveTab, setModalActiveTab] = useState<string>("detalhesPedido");

  // Estado para o AlertDialog de exclusão
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Estados para as novas actions de status
  const [adminAguardandoClienteMessage, setAdminAguardandoClienteMessage] = useState<string>(""); // <<< NOVO ESTADO

  // 1. Estado para filtro de título
  const [filtroTitulo, setFiltroTitulo] = useState("");

  // 1. Adicionar estado para justificativa de cancelamento
  const [adminCancelReason, setAdminCancelReason] = useState("");

  // Estados para os filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined);
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined);

  // Estado para filtro de texto do roteiro
  const [filtroTextoRoteiro, setFiltroTextoRoteiro] = useState("");

  const { // Este hook busca o histórico para o modal do pedido, deve ser mantido
    // data: historicoRevisoesPedido,
    // isLoading: isLoadingHistoricoRevisoesPedido,
    // isError: isErrorHistoricoRevisoesPedido,
    // error: errorHistoricoRevisoesPedido,
  } = useFetchSolicitacoesRevisaoDetalhadasPorPedido({
    pedidoId: selectedPedido?.id || null,
    enabled: isViewModalOpen && !!selectedPedido?.id, // Ativado quando o modal do pedido está aberto
  });

  const updateStatusMutation = useUpdatePedidoStatus();
  const uploadAudioMutation = useUploadPedidoAudio();
  const updateAudioAndStatusMutation = useUpdatePedidoAudioAndStatus();

  // Estado local para créditos ativos
  const [totalCreditosAtivos, setTotalCreditosAtivos] = useState<number | null>(null);
  const [loadingCreditosAtivos, setLoadingCreditosAtivos] = useState(true);

  // CORREÇÃO: Somar profiles.credits + lotes_creditos válidos
  const fetchCreditosAtivos = async () => {
    setLoadingCreditosAtivos(true);
    try {
            console.log("AdminDashboard: CORREÇÃO - Calculando total via APENAS lotes_creditos válidos");
      
      // Buscar APENAS créditos de lotes válidos (não expirados)
      const currentDate = new Date().toISOString();
      const { data: lotes, error: lotesError } = await supabase
        .from('lotes_creditos')
        .select('quantidade_adicionada, quantidade_usada, data_validade, data_adicao')
        .eq('status', 'ativo')
        .or(`data_validade.is.null,data_validade.gt.${currentDate}`);
      
      if (lotesError) {
        console.error("Erro ao buscar lotes de créditos:", lotesError);
        setTotalCreditosAtivos(null);
        return;
      }
      
      // Somar APENAS lotes válidos
      const totalValidos = lotes?.reduce((sum, lote) => 
        sum + (lote.quantidade_adicionada - (lote.quantidade_usada || 0)), 0) || 0;
      
      console.log("AdminDashboard: Total de créditos válidos:", totalValidos);
      console.log("AdminDashboard: Lotes válidos encontrados:", lotes?.length);
      setTotalCreditosAtivos(totalValidos);
      
    } catch (err) {
      console.error("Erro ao calcular créditos ativos:", err);
      setTotalCreditosAtivos(null);
    } finally {
      setLoadingCreditosAtivos(false);
    }
  };

  /* CÓDIGO ORIGINAL (comentado para correção):
  const fetchCreditosAtivos = async () => {
    setLoadingCreditosAtivos(true);
    try {
      const { data } = await supabase.rpc('get_total_creditos_ativos');
      let total = 0;
      if (Array.isArray(data) && data.length > 0) {
        total = data[0].get_total_creditos_ativos ?? data[0].total_creditos_ativos ?? data[0].sum ?? 0;
      } else if (typeof data === 'number') {
        total = data;
      } else if (typeof data === 'object' && data !== null) {
        total = data.get_total_creditos_ativos ?? data.total_creditos_ativos ?? data.sum ?? 0;
      }
      setTotalCreditosAtivos(total);
    } catch (err) {
      setTotalCreditosAtivos(null);
    } finally {
      setLoadingCreditosAtivos(false);
    }
  };
  */

  // Buscar créditos ativos ao montar
  useEffect(() => {
    fetchCreditosAtivos();
  }, []);

  // MANTER ESTA ACTION E SEU HOOK, SERÁ USADA NO MODAL DO PEDIDO NO FUTURO
  const { 
    execute: executeProcessarRevisao, 
    status: processarRevisaoStatus,
    reset: resetProcessarRevisaoAction,
  } = useAction(processarRevisaoAdminAction, {
    onExecute: () => {
      console.log('[AdminDashboardPage] Executando processarRevisaoAdminAction...');
      toast.loading('Processando revisão...');
      // setIsSubmittingRevisaoAdmin(true); // Este estado será gerenciado no modal do pedido
    },
    onSuccess: (data: Awaited<ReturnType<typeof processarRevisaoAdminAction>>) => {
      toast.dismiss();
      console.log('[AdminDashboardPage] processarRevisaoAdminAction onSuccess - Data:', JSON.stringify(data, null, 2));

      if (data?.data?.success && typeof data.data.success === 'string') {
        toast.success(data.data.success);
        queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
        fetchPedidosAdmin(); // Atualiza a lista de pedidos paginada
        if(selectedPedido?.id) { 
          queryClient.invalidateQueries({ queryKey: ['solicitacoesRevisaoDetalhadasPorPedido', selectedPedido.id] });
          // A activeRevisao será naturalmente recarregada se o modal for reaberto para o mesmo pedido,
          // devido ao useEffect que chama fetchActiveRevisao.
        }
        // Os estados do formulário de revisão são resetados pelo useEffect/onOpenChange do Dialog ao fechar.
        
        setIsViewModalOpen(false); // <<--- ADICIONAR ESTA LINHA PARA FECHAR O MODAL

      } else if (data?.data?.failure && typeof data.data.failure === 'string') {
        toast.error(`Falha ao processar revisão: ${data.data.failure}`);
      } else if (data?.serverError && typeof data.serverError === 'string') {
        if (data.serverError === "ACESSO_NEGADO_ADMIN") {
          toast.error("Acesso negado. Você não tem permissão para executar esta ação.");
        } else {
          toast.error(`Erro do servidor: ${data.serverError}`);
        }
      } else if (data?.validationErrors) {
        console.log('[AdminDashboardPage] processarRevisaoAdminAction onSuccess - ValidationErrors branch. Modal NÃO será fechado automaticamente (deveria ser pego pelo onError).');
      } else {
        toast.error('Resposta inesperada ao processar a revisão.');
      }
    },
    onError: (error: unknown) => {
      toast.dismiss();
      console.error('[AdminDashboardPage] Erro ao processar revisão (onError):', error);
      let errorMessage = 'Erro desconhecido ao processar revisão.';
      if (typeof error === 'object' && error !== null) {
        const err = error as { serverError?: string; validationErrors?: Record<string, string[]>; fetchError?: string };
        if (err.serverError) {
          errorMessage = err.serverError === "ACESSO_NEGADO_ADMIN"
            ? "Acesso negado. Você não tem permissão para executar esta ação."
            : `Erro do servidor: ${err.serverError}`;
        } else if (err.validationErrors) {
          const fieldMapping: Record<string, string> = {
            solicitacaoId: 'ID da Solicitação',
            adminFeedback: 'Feedback do Admin',
            audioFile: 'Arquivo de Áudio',
            novoStatusRevisao: 'Ação da Revisão',
          };
          const validationMessages = Object.entries(err.validationErrors)
            .map(([field, fieldMessages]) => {
              const fieldName = fieldMapping[field] || field;
              const messagesString = Array.isArray(fieldMessages) ? fieldMessages.join(', ') : 'Erro de validação';
              return `${fieldName}: ${messagesString}`;
            })
            .join('\n');
          errorMessage = `Erro de validação:\n${validationMessages}`;
        } else if (err.fetchError) {
          errorMessage = `Erro de comunicação: ${err.fetchError}`;
        }
      }
      toast.error(errorMessage);
    },
    onSettled: () => {
      resetProcessarRevisaoAction();
      // setIsSubmittingRevisaoAdmin(false); // Estado local do modal removido
      // Limpar campos do formulário de revisão após a ação, INDEPENDENTE do resultado.
      // Isso evita que, ao reabrir, dados antigos de uma tentativa falha persistam.
      // No entanto, o fechamento do modal (que já limpa via onOpenChange) é preferível se a ação for bem-sucedida.
      // Se a ação falhar e o modal permanecer aberto, o admin pode querer ajustar e tentar novamente.
      // A lógica atual de reset no onOpenChange do Dialog já cuida disso quando o modal é fechado.
    }
  });

  // Nova função para buscar pedidos com filtros e paginação
  const fetchPedidosAdmin = async () => {
    console.log('[AdminDashboardPage] fetchPedidosAdmin chamado com filtros:', { filtroStatus, dataInicio, dataFim, currentPage, itemsPerPage });
    setLoadingPedidos(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      // Query para contagem total com filtros
      let countQuery = supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true });

      if (filtroStatus !== 'todos') {
        countQuery = countQuery.eq('status', filtroStatus);
      }
      if (dataInicio) {
        countQuery = countQuery.gte('created_at', format(startOfDay(dataInicio), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
      }
      if (dataFim) {
        countQuery = countQuery.lte('created_at', format(endOfDay(dataFim), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
      }
      
      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('[AdminDashboardPage] Erro ao contar pedidos admin:', countError);
        toast.error('Erro ao obter contagem de pedidos.');
        // Não limpar pedidos aqui, pode haver dados da página anterior
      } else {
        setTotalPedidosCount(count || 0);
      }

      // Query principal para buscar dados paginados com filtros
      let dataQuery = supabase
        .from('pedidos')
        .select(`
          id, created_at, status, texto_roteiro, creditos_debitados, titulo,
          estilo_locucao, tipo_audio, orientacoes, id_pedido_serial,
          audio_final_url, audio_guia_url, downloaded_at, cliente_notificado_em,
          admin_message, cliente_resposta_info, data_resposta_cliente, cliente_audio_resposta_url,
          profile:profiles ( id, full_name, email, username ),
          locutores ( id, nome )
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filtroStatus !== 'todos') {
        dataQuery = dataQuery.eq('status', filtroStatus);
      }
      if (dataInicio) {
        dataQuery = dataQuery.gte('created_at', format(startOfDay(dataInicio), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
      }
      if (dataFim) {
        dataQuery = dataQuery.lte('created_at', format(endOfDay(dataFim), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
      }
      
      // 3. Adicionar filtro pelo título no fetchPedidosAdmin
      if (filtroTitulo.trim() !== "") {
        dataQuery = dataQuery.ilike('titulo', `%${filtroTitulo.trim()}%`);
        countQuery = countQuery.ilike('titulo', `%${filtroTitulo.trim()}%`);
      }
      // Filtro por parte do texto do roteiro
      if (filtroTextoRoteiro.trim() !== "") {
        dataQuery = dataQuery.ilike('texto_roteiro', `%${filtroTextoRoteiro.trim()}%`);
        countQuery = countQuery.ilike('texto_roteiro', `%${filtroTextoRoteiro.trim()}%`);
      }
      
      const { data, error: dataError } = await dataQuery;

      if (dataError) {
        console.error('[AdminDashboardPage] Erro DETALHADO ao buscar pedidos admin (paginado):', JSON.stringify(dataError, null, 2));
        toast.error(`Erro ao buscar pedidos: ${dataError.message || 'Detalhes no console.'}`);
        setPedidosExibidos([]);
      } else {
        const pedidosFormatados = data.map(p => {
          const profileData = Array.isArray(p.profile) ? p.profile[0] : p.profile;
          const locutorData = Array.isArray(p.locutores) ? p.locutores[0] : p.locutores;
          
          // Mapeamento explícito para AdminPedido
          return {
            id: p.id,
            id_pedido_serial: p.id_pedido_serial,
            created_at: p.created_at,
            texto_roteiro: p.texto_roteiro,
            status: p.status,
            user_id: profileData?.id || '', // Correção crucial aqui
            profile: profileData ? {
              id: profileData.id,
              full_name: profileData.full_name,
              username: profileData.username,
              email: profileData.email,
            } : null,
            locutores: locutorData ? { nome: locutorData.nome } : null,
            audio_final_url: p.audio_final_url,
            audio_guia_url: p.audio_guia_url,
            titulo: p.titulo,
            estilo_locucao: p.estilo_locucao,
            orientacoes: p.orientacoes,
            tipo_audio: p.tipo_audio,
            creditos_debitados: p.creditos_debitados,
            admin_message: p.admin_message,
            cliente_resposta_info: p.cliente_resposta_info,
            data_resposta_cliente: p.data_resposta_cliente,
            cliente_audio_resposta_url: p.cliente_audio_resposta_url,
          };
        }) as AdminPedido[];
        console.log('[AdminDashboardPage] Pedidos (paginados) recebidos e formatados:', pedidosFormatados);
        setPedidosExibidos(pedidosFormatados);
      }
    } catch (e) {
      console.error('[AdminDashboardPage] Exceção ao buscar pedidos admin (paginado):', e);
      toast.error('Ocorreu uma exceção ao buscar os pedidos.');
      setPedidosExibidos([]);
    } finally {
      setLoadingPedidos(false);
    }
  };

  // useEffect para buscar pedidos quando os filtros ou paginação mudarem
  useEffect(() => {
    fetchPedidosAdmin();
  }, [filtroStatus, dataInicio, dataFim, currentPage, itemsPerPage, filtroTitulo, filtroTextoRoteiro]); // Adicionado filtroTextoRoteiro

  const handleOpenViewModal = async (pedido: AdminPedido) => {
    console.log('[AdminDashboardPage] Abrindo modal para pedido:', pedido);
    setSelectedPedido(pedido);
    setCurrentPedidoStatus(pedido.status); // Define o status atual do select
    setSelectedFile(null);
    setActiveRevisao(null);
    setCurrentRevisaoAdminFeedback("");
    setCurrentRevisaoModalStatus(undefined);
    setRevisaoAudioFile(null);
    setAdminAguardandoClienteMessage(""); // <<< LIMPAR ESTADO AQUI
    setModalActiveTab("detalhesPedido");
    setIsViewModalOpen(true);

    if (pedido.status === PEDIDO_STATUS.PENDENTE) {
      console.log(`[AdminDashboardPage] Pedido ${pedido.id} está PENDENTE. Tentando marcar como EM ANÁLISE automaticamente.`);
      setIsProcessingAutoStatusChange(true); // Feedback visual para a ação automática
      try {
        const result = await adminMarcarPedidoEmAnaliseAction({ pedidoId: pedido.id });
        if (result?.data?.success) {
          toast.success(result.data.message || "Pedido marcado como EM ANÁLISE.");
          // Atualizar o estado local do pedido selecionado e o select
          const novoStatusEmAnalise = PEDIDO_STATUS.EM_ANALISE;
          setSelectedPedido(prev => prev ? { ...prev, status: novoStatusEmAnalise } : null);
          setCurrentPedidoStatus(novoStatusEmAnalise); // Atualiza o select no modal
          
          fetchPedidosAdmin(); // Atualiza a lista de pedidos na tabela
          queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
        } else if (result?.data?.failure) {
          toast.error(`Falha automática: ${result.data.failure}`);
        } else if (result?.serverError) {
          toast.error(`Erro do servidor (auto): ${result.serverError}`);
        } else {
          toast.error("Resposta inesperada ao marcar pedido em análise automaticamente.");
        }
      } catch (error) {
        console.error("[AdminDashboardPage] Erro ao chamar adminMarcarPedidoEmAnaliseAction automaticamente:", error); // Corrigido mensagem de erro
        toast.error("Erro crítico ao tentar marcar pedido em análise automaticamente.");
      } finally {
        setIsProcessingAutoStatusChange(false);
      }
    }
  };
  
  // Remover handleMarcarEmAnalise - agora é automático em handleOpenViewModal
  // Remover handleIniciarGravacao - não existe mais botão dedicado

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpdatePedido = async () => {
    if (!selectedPedido) return;

    // VALIDAÇÃO MOVIDA PARA DENTRO DO HANDLER
    if (currentPedidoStatus === PEDIDO_STATUS.AGUARDANDO_CLIENTE && !adminAguardandoClienteMessage.trim()) {
      toast.error("A mensagem para o cliente é obrigatória para este status.");
      return;
    }
    
    // Verifica se houve mudança no status selecionado ou se um arquivo foi adicionado.
    const statusHasChanged = currentPedidoStatus !== selectedPedido.status;
    const fileHasBeenSelected = selectedFile !== null;

    if (!statusHasChanged && !fileHasBeenSelected) {
      return;
    }

    setIsUpdatingPedido(true);

    try {
      let audioUrlToUpdate: string | undefined = undefined;

      if (fileHasBeenSelected && selectedFile) {
        const username = selectedPedido.profile?.username;
        if (!username) {
          toast.error('Username do cliente não encontrado para upload.');
          setIsUpdatingPedido(false);
          return;
        }
        const uploadResult = await uploadAudioMutation.mutateAsync({ file: selectedFile, username });
        audioUrlToUpdate = uploadResult.filePath;
      }

      let novoStatusFinal = currentPedidoStatus;
      if (audioUrlToUpdate) {
        novoStatusFinal = PEDIDO_STATUS.CONCLUIDO;
      }

      // 3. No handleUpdatePedido, validar justificativa
      if (currentPedidoStatus === PEDIDO_STATUS.CANCELADO && !adminCancelReason.trim()) {
        toast.error("A justificativa do cancelamento é obrigatória.");
        setIsUpdatingPedido(false);
        return;
      }

      // 5. Se status for CANCELADO, chamar a nova RPC cancelar_pedido_e_estornar_creditos
      if (currentPedidoStatus === PEDIDO_STATUS.CANCELADO) {
        const { data: result, error } = await supabase.rpc('cancelar_pedido_e_estornar_creditos', {
          p_pedido_id: selectedPedido.id,
          p_justificativa: adminCancelReason.trim(),
        });
        if (error || result?.status === 'error') {
          toast.error(result?.message || error?.message || 'Erro ao cancelar pedido.');
          setIsUpdatingPedido(false);
          return;
        }
        toast.success(result?.message || 'Pedido cancelado e créditos estornados com sucesso.');
        setSelectedPedido(prev => prev ? { ...prev, status: PEDIDO_STATUS.CANCELADO } : null);
        setCurrentPedidoStatus(PEDIDO_STATUS.CANCELADO);
        fetchPedidosAdmin();
        fetchCreditosAtivos();
        queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
        setIsViewModalOpen(false);
        setIsUpdatingPedido(false);
        return;
      }

      const mutationPayload: { 
        pedidoId: string; 
        novoStatus: string; 
        audioUrl?: string;
        adminMessage?: string; 
        adminCancelReason?: string;
      } = {
        pedidoId: selectedPedido.id,
        novoStatus: novoStatusFinal,
      };

      if (audioUrlToUpdate) {
        mutationPayload.audioUrl = audioUrlToUpdate;
      }

      if (novoStatusFinal === PEDIDO_STATUS.AGUARDANDO_CLIENTE) {
        if (!adminAguardandoClienteMessage.trim()) {
          toast.error("A mensagem para o cliente é obrigatória ao definir o status como 'Aguardando Cliente'.");
          setIsUpdatingPedido(false);
          return;
        }
        mutationPayload.adminMessage = adminAguardandoClienteMessage.trim();
      }

      await updateAudioAndStatusMutation.mutateAsync(mutationPayload);
      toast.success("Pedido atualizado com sucesso!");
      setSelectedPedido(prev => prev ? { ...prev, status: novoStatusFinal, audio_final_url: audioUrlToUpdate || prev.audio_final_url } : null);
      setCurrentPedidoStatus(novoStatusFinal);
      fetchPedidosAdmin();
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      setIsViewModalOpen(false);
    } catch (error) {
      console.error('Erro em handleUpdatePedido:', error);
      if (error instanceof Error) {
         toast.error(`Erro ao atualizar pedido: ${error.message}`);
      }
    } finally {
      setIsUpdatingPedido(false);
    }
  };

  const handleReopenPedido = async () => {
    if (!selectedPedido || (selectedPedido.status !== 'concluido' && selectedPedido.status !== 'cancelado')) return;

    setIsUpdatingPedido(true);

    try {
      const novoStatusParaReabertura = 'pendente';
      await updateStatusMutation.mutateAsync({
        pedidoId: selectedPedido.id,
        novoStatus: novoStatusParaReabertura,
      });
      setSelectedPedido((prev: AdminPedido | null) => prev ? { ...prev, status: novoStatusParaReabertura, audio_final_url: null } : null);
      setCurrentPedidoStatus(novoStatusParaReabertura);
      setSelectedFile(null);
    } catch (error) {
      console.error('Erro em handleReopenPedido:', error);
    } finally {
      setIsUpdatingPedido(false);
    }
  };

  const statCardsData = [
    { 
      title: "Clientes Ativos", 
      valueKey: "activeclients",
      icon: Users,
      subtext: "Total de usuários com role 'cliente'",
      iconColorClass: "text-status-blue",
    },
    {
      title: "Créditos (Clientes)", 
      valueKey: "totalclientcredits", // NÃO USAR MAIS ESTE VALOR
      icon: CreditCard, 
      subtext: "Soma de créditos dos clientes",
      iconColorClass: "text-status-green",
      customValue: totalCreditosAtivos,
      customLoading: loadingCreditosAtivos,
    },
    {
      title: "Pedidos Pendentes",
      valueKey: "pendingorders",
      icon: ListChecks, // Usava ListChecks, pode ser trocado se Revisões Pendentes usar ListChecks
      subtext: "Pedidos aguardando gravação",
      iconColorClass: "text-status-orange",
      tagKey: "pendingorders",
      tagColorClass: "bg-status-orange text-white"
    },
    // NOVO CARD ADICIONADO AQUI
    {
      title: "Revisões Pendentes", 
      valueKey: "revisoes_pendentes_count", // Chave correspondente em AdminDashboardStats
      icon: ListChecks, // Ícone para revisões pendentes
      subtext: "Solicitações de revisão aguardando ação.",
      iconColorClass: "text-status-yellow", // Exemplo de cor, ajuste conforme necessário
      tagKey: "revisoes_pendentes_count",
      tagColorClass: "bg-status-yellow text-black" // Exemplo de cor, ajuste conforme necessário
    },
  ];

  // const adminRevisaoStatusOptions = [ ... ]; // Removido, pois o modal específico foi removido. Será reintroduzido no modal do pedido.

  // Opções para o filtro de status, incluindo "Todos Status" e "Em Revisão"
  const PEDIDO_STATUS_OPTIONS_FILTRO = [
    { value: 'todos', label: 'Todos Status' },
    { value: PEDIDO_STATUS.PENDENTE, label: 'Pendente' },
    { value: PEDIDO_STATUS.EM_ANALISE, label: 'Em Análise' },
    { value: PEDIDO_STATUS.EM_PRODUCAO, label: 'Em Produção' }, // Nova opção
    // { value: PEDIDO_STATUS.GRAVANDO, label: 'Gravando' }, // Ocultar/Remover se EM_PRODUCAO substitui na UI
    { value: PEDIDO_STATUS.EM_REVISAO, label: 'Em Revisão' },
    { value: PEDIDO_STATUS.AGUARDANDO_CLIENTE, label: 'Aguardando Cliente' },
    { value: PEDIDO_STATUS.CONCLUIDO, label: 'Concluído' },
    { value: PEDIDO_STATUS.CANCELADO, label: 'Cancelado' },
    { value: PEDIDO_STATUS.REJEITADO, label: 'Rejeitado' }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - A lógica de filtro é intencional e lida com tipos mistos (string literal 'todos' e enum PEDIDO_STATUS)
  ].filter(opt => opt.value !== PEDIDO_STATUS.GRAVANDO || opt.value === 'todos'); // Remove "Gravando" exceto se for "todos"

  // Função para buscar a solicitação de revisão ativa
  const fetchActiveRevisao = async (pedidoId: string) => {
    if (!pedidoId) {
      setActiveRevisao(null);
      return;
    }
    setLoadingRevisao(true);
    setActiveRevisao(null); // Limpa revisão anterior ao buscar nova
    try {
      console.log(`[AdminDashboardPage] fetchActiveRevisao: Buscando última revisão para pedido ID: ${pedidoId}`);
      const { data, error } = await supabase
        .from('solicitacoes_revisao')
        .select(`
          *,
          descricao_cliente:descricao
        `)
        .eq('pedido_id', pedidoId)
        .order('data_solicitacao', { ascending: false })
        .limit(1)
        // .single(); // REMOVER TEMPORARIAMENTE PARA TESTE

      console.log('[AdminDashboardPage] fetchActiveRevisao: Resultado da query Supabase:', { data, error });

      if (error && error.code !== 'PGRST116') { // PGRST116: single() retornou 0 linhas, o que é ok
        console.error("[AdminDashboardPage] fetchActiveRevisao: Erro ao buscar revisão ativa:", JSON.stringify(error, null, 2));
        toast.error(`Erro ao buscar detalhes da revisão: ${error.message}`);
        setActiveRevisao(null);
      } else {
        // const loadedRevisao = data as SolicitacaoRevisaoDetalhada | null; // Comentado por causa da remoção de .single()
        const loadedRevisaoArray = data as SolicitacaoRevisaoDetalhada[] | null; // Agora esperamos um array
        const loadedRevisao = loadedRevisaoArray && loadedRevisaoArray.length > 0 ? loadedRevisaoArray[0] : null;

        console.log("[AdminDashboardPage] fetchActiveRevisao: Dados carregados (loadedRevisaoArray) ANTES de setActiveRevisao:", JSON.stringify(loadedRevisaoArray, null, 2));
        console.log("[AdminDashboardPage] fetchActiveRevisao DEBUG: loadedRevisao (após ajuste do array):", loadedRevisao); 
        
        if (!loadedRevisao) {
          console.warn("[AdminDashboardPage] fetchActiveRevisao: Nenhuma revisão ativa encontrada (loadedRevisao é null ou vazio).");
        }
        
        setActiveRevisao(loadedRevisao); 
        // console.log("[AdminDashboardPage] Revisão ativa carregada:", loadedRevisao); // Log original, mantido para referência mas o acima é mais detalhado
        if (loadedRevisao) { // Erro de digitação aqui, deve ser loadedRevisao
          // Pré-popular estados para os campos do formulário de revisão
          setCurrentRevisaoAdminFeedback(loadedRevisao.admin_feedback || "");
          // Se o status da revisão já é final, não pré-selecionar para nova ação.
          // Se for uma revisão 'solicitada' ou sem status definido (pode acontecer se o enum mudar e o dado no DB for antigo),
          // sugere 'em_andamento_admin'.
          if (loadedRevisao.status_revisao && 
              (loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.NEGADA || 
               loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO ||
               loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE ||
               loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU || // Adicionado CLIENTE_RESPONDEU aqui se for um status final no select do admin
               loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN)) { // Adicionado EM_ANDAMENTO_ADMIN
            setCurrentRevisaoModalStatus(loadedRevisao.status_revisao as TipoRevisaoStatusAdmin);
          } else if (loadedRevisao.status_revisao === REVISAO_STATUS_ADMIN.SOLICITADA || !loadedRevisao.status_revisao) {
            setCurrentRevisaoModalStatus(REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN); // Mapeia SOLICITADA para EM_ANDAMENTO_ADMIN
          } else {
            // Fallback para outros status não explicitamente mapeados para um TipoRevisaoStatusAdmin válido
            setCurrentRevisaoModalStatus(REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN); 
          }
          setRevisaoAudioFile(null); // Limpar seleção de arquivo anterior
        } else {
          setCurrentRevisaoAdminFeedback("");
          setCurrentRevisaoModalStatus(REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN); // Default para nova revisão ou sem revisão ativa
          setRevisaoAudioFile(null);
        }
      }
    } catch (err: any) {
      console.error("[AdminDashboardPage] fetchActiveRevisao: Exceção ao buscar revisão ativa:", err);
      toast.error(`Exceção ao buscar detalhes da revisão: ${err.message}`);
      setActiveRevisao(null);
    } finally {
      setLoadingRevisao(false);
    }
  };
  
  // useEffect para buscar revisão ativa quando o modal é aberto ou o pedido selecionado muda
  useEffect(() => {
    if (isViewModalOpen && selectedPedido?.id) {
      fetchActiveRevisao(selectedPedido.id);
      setModalActiveTab("detalhesPedido"); // Resetar para a aba de detalhes ao abrir/mudar pedido
    } else {
      setActiveRevisao(null); // Limpa se o modal fechar ou não houver pedido
      setCurrentRevisaoAdminFeedback("");
      setCurrentRevisaoModalStatus(undefined); // Limpar status da revisão modal
      setRevisaoAudioFile(null);
    }
  }, [isViewModalOpen, selectedPedido?.id]);

  // Handler para exclusão de pedido
  const handleDeletePedido = async () => {
    console.log('[handleDeletePedido] Iniciada.'); // Log adicionado
    if (!selectedPedido) {
      console.warn('[handleDeletePedido] Pedido não selecionado. Abortando.');
      return;
    }
    setIsUpdatingPedido(true); 

    try {
      console.log(`[handleDeletePedido] Tentando excluir pedido ID: ${selectedPedido.id}, Serial: ${selectedPedido.id_pedido_serial}`); // Log adicionado
      // Verificar se supabaseClient está definido ou se supabase (global) deve ser usado
      // Assumindo que supabase (importado de @/lib/supabaseClient) é o correto
      console.log('[handleDeletePedido] Chamando RPC excluir_pedido_e_estornar_creditos_real...'); // Log adicionado e nome corrigido
      const { data: result, error } = await supabase.rpc('excluir_pedido_e_estornar_creditos_real', { // <<< CORREÇÃO AQUI
        p_pedido_id: selectedPedido.id
      });

      console.log('[handleDeletePedido] RPC Result:', result); // Log adicionado
      console.log('[handleDeletePedido] RPC Error:', error); // Log adicionado

      if (error) {
        console.error("[handleDeletePedido] Erro RPC ao excluir pedido:", error);
        throw new Error(error.message || 'Falha ao chamar RPC para excluir pedido.');
      }
      
      // CORREÇÃO: A RPC `_real` retorna um objeto { success: boolean, message?: string, error?: string }.
      // A verificação deve ser baseada na propriedade `success`.
      if (!result?.success) {
        const errorMessage = result?.error || result?.message || 'Falha ao excluir o pedido. A RPC não retornou sucesso.';
        console.error("[handleDeletePedido] Erro retornado pela RPC excluir_pedido_e_estornar_creditos_real:", errorMessage);
        throw new Error(errorMessage);
      }

      toast.success(result?.message || "Pedido excluído e créditos estornados com sucesso.");
      setIsDeleteAlertOpen(false); 
      setIsViewModalOpen(false);  
      fetchPedidosAdmin();      
      fetchCreditosAtivos(); // Atualiza créditos após exclusão
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] }); 
      if (refreshProfile) await refreshProfile(); // Atualiza o saldo do usuário no AuthContext

    } catch (err: any) {
      console.error("[handleDeletePedido] Catch:", err); // Log adicionado
      toast.error(err.message || "Ocorreu um erro ao tentar excluir o pedido.");
    } finally {
      setIsUpdatingPedido(false);
      console.log('[handleDeletePedido] Finalizada.'); // Log adicionado
    }
  };

  // Handler para iniciar gravação do pedido (EM ANÁLISE -> GRAVANDO)
  // Removido completamente pois adminIniciarGravacaoPedidoAction não existe mais

  // Adicionar console.log dentro do corpo do componente para ver estados relevantes
  console.log('[AdminDashboardPage Render] selectedPedido:', selectedPedido?.id, 'Status:', selectedPedido?.status);
  console.log('[AdminDashboardPage Render] currentPedidoStatus (do Select):', currentPedidoStatus);
  console.log('[AdminDashboardPage Render] selectedFile:', selectedFile?.name);
  console.log('[AdminDashboardPage Render] isProcessingAutoStatusChange:', isProcessingAutoStatusChange);
  console.log('[AdminDashboardPage Render] isUpdatingPedido:', isUpdatingPedido);

  const showSalvarButtonCondition = modalActiveTab === 'detalhesPedido' && selectedPedido &&
    selectedPedido.status !== PEDIDO_STATUS.PENDENTE &&
    selectedPedido.status !== PEDIDO_STATUS.CONCLUIDO &&
    selectedPedido.status !== PEDIDO_STATUS.CANCELADO &&
    ((currentPedidoStatus !== selectedPedido.status) || !!selectedFile);
  
  console.log('[AdminDashboardPage Render] Condição para mostrar botão Salvar:', showSalvarButtonCondition);

  // Handler para mudança de arquivo de revisão
  const handleRevisaoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setRevisaoAudioFile(event.target.files[0]);
      // Se um arquivo for selecionado e o status não for "Revisado e Finalizado", 
      // automaticamente muda para "Revisado e Finalizado" para facilitar.
      if (currentRevisaoModalStatus !== REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO) {
        setCurrentRevisaoModalStatus(REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO);
      }
    } else {
      setRevisaoAudioFile(null);
    }
  };

  return (
      <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-foreground">Visão Geral</h1>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
              fetchPedidosAdmin();
              fetchCreditosAtivos(); // Atualiza créditos ao atualizar tudo
            }}
            disabled={isFetchingStats || loadingPedidos}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", (isFetchingStats || loadingPedidos) && "animate-spin")} />
            Atualizar Tudo
          </Button>
        </div>
        <Separator className="my-4 bg-neutral-800" />
        {isFetchStatsError && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
            Erro ao carregar estatísticas do dashboard: {fetchStatsError?.message}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(isLoadingStats ? Array.from({ length: statCardsData.length }).map((_, i) => ({ id: i, isLoading: true })) : statCardsData).map((cardInfo: any, index) => {
            let Icon = cardInfo.isLoading ? Loader2 : cardInfo.icon;
            let value;
            if (cardInfo.title === "Créditos (Clientes)") {
              value = cardInfo.customLoading ? null : cardInfo.customValue;
            } else {
              value = cardInfo.isLoading ? null 
                : cardInfo.valueKey && stats ? stats[cardInfo.valueKey as keyof AdminDashboardStats] 
                : cardInfo.value;
            }
            let tagText = cardInfo.isLoading ? null : (cardInfo.tagKey && stats ? stats[cardInfo.tagKey as keyof AdminDashboardStats] : cardInfo.tagText);

            // Card de Correções Pendentes - lógica ajustada
            if (cardInfo.title === "Correções Pendentes") {
              // Este card atualmente não tem uma métrica correspondente em AdminDashboardStats.
              // Exibindo 0 como placeholder.
              // TODO: Implementar a métrica 'pendingcorrecoes' ou similar na RPC get_admin_dashboard_stats e no tipo AdminDashboardStats.
              Icon = cardInfo.icon; // Usar o ícone definido no cardInfo
              value = 0; // Placeholder
              // specificLoading não é aplicável aqui se não há dados sendo carregados especificamente para este card.
            }

            return (
              <Card key={`stat-${index}`} className={`shadow-lg hover:shadow-xl transition-shadow rounded-2xl bg-card text-card-foreground border-none`}>
                {cardInfo.isLoading || (cardInfo.title === "Correções Pendentes" && isLoadingStats) || (cardInfo.title === "Créditos (Clientes)" && cardInfo.customLoading) ? (
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <Skeleton className="h-12 w-12 rounded-full mb-3" /> 
                    <Skeleton className="h-8 w-1/2 mb-2" />      
                    <Skeleton className="h-4 w-3/4" />         
                  </CardContent>
                ) : (
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-startt-blue to-startt-purple text-white shadow-lg">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="text-3xl font-bold bg-gradient-to-r from-startt-blue to-startt-purple bg-clip-text text-transparent">
                      {value !== undefined && value !== null ? value.toLocaleString('pt-BR') : (cardInfo.valueKey === undefined && !cardInfo.fixedValue && cardInfo.title !== "Correções Pendentes") ? '-' : '0'}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground mt-1 text-center">
                      {cardInfo.title}
                    </p>
                    {cardInfo.subtext && (
                       <p className="text-xs text-muted-foreground text-center">
                         {cardInfo.subtext}
                       </p>
                    )}
                    {tagText !== undefined && tagText !== null && (cardInfo.tagKey || cardInfo.tagText) && (
                      <div className={`mt-2 inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-gradient-to-r from-startt-blue to-startt-purple text-white`}>
                        {tagText} {cardInfo.tagKey && cardInfo.title.includes("Pedidos") ? (String(tagText) === '1' ? " Pedido" : " Pedidos") : ""}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-foreground">Lista de Pedidos</h2>
        </div>
        <Separator className="my-4 bg-neutral-800" />

        {/* Seção de Filtros */}
        <div className="mb-6 p-4 border-none rounded-lg shadow-sm bg-card">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Filtrar Pedidos</h2>
          <div className="flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-end"> {/* Alterado para items-end para alinhar botão com inputs */}
            {/* Filtro de Status */}
            <div className="flex-1 min-w-[200px] md:min-w-[250px]">
              <Label htmlFor="filtro-status-pedido" className="mb-1 block text-sm font-medium text-gray-700">Status do Pedido</Label>
              <Select
                value={filtroStatus}
                onValueChange={setFiltroStatus}
              >
                <SelectTrigger id="filtro-status-pedido" className="w-full">
                  <SelectValue placeholder="Selecione um status" />
                </SelectTrigger>
                <SelectContent>
                  {PEDIDO_STATUS_OPTIONS_FILTRO.map(option => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filtro de Título */}
            <div className="flex-1 min-w-[200px] md:min-w-[250px]">
              <Label htmlFor="filtro-titulo-pedido" className="mb-1 block text-sm font-medium text-gray-700">Título do Pedido</Label>
              <Input
                id="filtro-titulo-pedido"
                type="text"
                placeholder="Buscar por título..."
                value={filtroTitulo}
                onChange={e => setFiltroTitulo(e.target.value)}
                className="w-full"
              />
            </div>
            {/* Filtro de Texto do Roteiro */}
            <div className="flex-1 min-w-[200px] md:min-w-[250px]">
              <Label htmlFor="filtro-texto-roteiro" className="mb-1 block text-sm font-medium text-gray-700">Texto do Roteiro</Label>
              <Input
                id="filtro-texto-roteiro"
                type="text"
                placeholder="Buscar por parte do roteiro..."
                value={filtroTextoRoteiro}
                onChange={e => setFiltroTextoRoteiro(e.target.value)}
                className="w-full"
              />
            </div>
            {/* Filtro de Data */}
            <div className="flex flex-1 flex-col md:flex-row gap-4 min-w-[280px] md:min-w-[320px]">
              <div className="flex-1">
                <Label htmlFor="filtro-data-inicio" className="mb-1 block text-sm font-medium text-gray-700">Data Início</Label>
                <DatePickerSingle
                  label=""
                  date={dataInicio}
                  onDateChange={setDataInicio}
                  placeholder="Data inicial"
                  className="mb-2 md:mb-0"
                  id="filtro-data-inicio"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="filtro-data-fim" className="mb-1 block text-sm font-medium text-gray-700">Data Fim</Label>
                <DatePickerSingle
                  label=""
                  date={dataFim}
                  onDateChange={setDataFim}
                  placeholder="Data final"
                  id="filtro-data-fim"
                />
              </div>
            </div>
            {/* Botão Limpar Filtros */}
            <Button 
              onClick={() => { 
                setFiltroStatus('todos'); 
                setDataInicio(undefined); 
                setDataFim(undefined); 
                setFiltroTitulo("");
                setFiltroTextoRoteiro("");
              }} 
              variant="outline" 
              className="w-full md:w-auto md:ml-auto mt-2 md:mt-0"
            >
              Limpar Filtros
            </Button>
        </div>
      </div>

      {/* Tabela de Pedidos Unificada */}
        <Card className="mb-6 admin-table-fix-dark-border border-none">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ListChecks className="mr-2 h-5 w-5 text-amber-500 dark:text-blue-500" />
              Pedidos ({loadingPedidos ? '...' : totalPedidosCount}) {/* Usar totalPedidosCount */}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPedidos ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500 dark:text-blue-500" />
                <p className="ml-2 text-gray-600">Carregando pedidos...</p>
              </div>
            ) : pedidosExibidos.length > 0 ? ( // Usar pedidosExibidos
            <Table>
                <TableCaption>
                  {totalPedidosCount === 0 ? "Nenhum pedido encontrado com os filtros atuais." : `Exibindo ${pedidosExibidos.length} de ${totalPedidosCount} pedido(s).`}
                </TableCaption>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[100px]">ID Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Locutor</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-[150px]">Data</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="text-right w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {pedidosExibidos.map((pedido) => ( // Usar pedidosExibidos
                    <TableRow key={pedido.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium whitespace-nowrap max-w-[120px]">{pedido.id_pedido_serial}</TableCell>
                      <TableCell>
                        <div className="font-medium">{pedido.profile?.full_name || pedido.profile?.username || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">{pedido.profile?.email}</div>
                      </TableCell>
                      <TableCell>{pedido.locutores?.nome || 'Não definido'}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={pedido.titulo || ''}>{pedido.titulo || 'Sem título'}</TableCell>
                      <TableCell>{format(new Date(pedido.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}</TableCell>
                      <TableCell>
                          {/* Lógica do Badge de Status mantida */}
                        <Badge
                            variant={
                              pedido.status === 'pendente' ? 'default' :
                              pedido.status === 'gravando' ? 'secondary' :
                              pedido.status === 'concluido' ? 'outline' : 
                              pedido.status === 'cancelado' ? 'destructive' :
                              pedido.status === 'em_revisao' ? 'outline' : 
                              pedido.status === 'aguardando_cliente' ? 'outline' :
                              pedido.status === PEDIDO_STATUS.EM_PRODUCAO ? 'outline' : // Adicionado para consistência
                              pedido.status === PEDIDO_STATUS.EM_ANALISE ? 'outline' : // Adicionado para consistência
                              'outline'
                            }
                          className={cn(
                              "capitalize",
                              pedido.status === 'concluido' && "border-green-500 bg-green-100 text-green-700 dark:border-green-400 dark:bg-green-900/30 dark:text-green-300",
                              pedido.status === 'em_revisao' && "border-pink-500 bg-pink-100 text-pink-700 dark:border-pink-400 dark:bg-pink-900/30 dark:text-pink-300",
                              pedido.status === 'aguardando_cliente' && "border-amber-500 bg-amber-100 text-amber-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300",
                              // ADICIONAR ESTILOS PARA EM_PRODUCAO E EM_ANALISE
                              pedido.status === PEDIDO_STATUS.EM_PRODUCAO && "border-orange-500 dark:border-orange-400 bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-200",
                              pedido.status === PEDIDO_STATUS.EM_ANALISE && "border-amber-500 bg-amber-100 text-amber-700 dark:border-sky-400 dark:bg-sky-900/30 dark:text-sky-300", // Exemplo: cor laranja para EM_ANALISE
                              pedido.status === PEDIDO_STATUS.PENDENTE && "border-gray-400 bg-gray-100 text-gray-600 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-300" // Exemplo: cor cinza para PENDENTE
                            )}
                          >
                            {PEDIDO_STATUS_OPTIONS_FILTRO.find(opt => opt.value === pedido.status)?.label || pedido.status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenViewModal(pedido)}>
                          <Eye className="h-4 w-4 mr-1" /> Visualizar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            ) : (
              <div className="text-center py-10">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Nenhum pedido encontrado.</p>
                <p className="text-xs text-gray-400">Tente ajustar os filtros ou aguarde novos pedidos.</p>
          </div>
        )}
            {/* Componentes de Paginação */} 
            {totalPedidosCount > 0 && (
              <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {pedidosExibidos.length} de {totalPedidosCount} pedidos.
      </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Itens por página:</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1); // Resetar para a primeira página ao mudar itens por página
                    }}
                  >
                    <SelectTrigger className="w-[70px] h-8 text-xs">
                      <SelectValue placeholder={String(itemsPerPage)} />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map(size => (
                        <SelectItem key={size} value={String(size)} className="text-xs">
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
        </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setCurrentPage(prev => Math.max(1, prev - 1));
                        }}
                        className={cn("cursor-pointer", currentPage === 1 && "pointer-events-none opacity-50")}
                      />
                    </PaginationItem>

                    {/* Lógica para renderizar links de página (simplificada, pode ser melhorada com ellipsis) */} 
                    {(() => {
                      const totalPages = Math.ceil(totalPedidosCount / itemsPerPage);
                      const pageNumbers = [];
                      // Lógica básica de ellipsis (pode ser expandida)
                      const pageLimit = 5; // Quantos números de página mostrar antes/depois do ellipsis
                      let leftSide = currentPage - Math.floor(pageLimit / 2);
                      let rightSide = currentPage + Math.floor(pageLimit / 2);

                      if (leftSide < 1) {
                        leftSide = 1;
                        rightSide = Math.min(totalPages, pageLimit);
                      }
                      if (rightSide > totalPages) {
                        rightSide = totalPages;
                        leftSide = Math.max(1, totalPages - pageLimit + 1);
                      }

                      if (leftSide > 1) {
                        pageNumbers.push(
                          <PaginationItem key="start-ellipsis">
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }

                      for (let i = leftSide; i <= rightSide; i++) {
                        pageNumbers.push(
                          <PaginationItem key={i}>
                            <PaginationLink
                              onClick={(e: React.MouseEvent) => {
                                e.preventDefault();
                                setCurrentPage(i);
                              }}
                              isActive={currentPage === i}
                              className="cursor-pointer"
                            >
                              {i}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }

                      if (rightSide < totalPages) {
                        pageNumbers.push(
                          <PaginationItem key="end-ellipsis">
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return pageNumbers;
                    })()}
                    
                    <PaginationItem>
                      <PaginationNext
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setCurrentPage(prev => Math.min(Math.ceil(totalPedidosCount / itemsPerPage), prev + 1));
                        }}
                        className={cn("cursor-pointer", currentPage === Math.ceil(totalPedidosCount / itemsPerPage) && "pointer-events-none opacity-50")}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
          </div>
        )}
          </CardContent>
        </Card>
      </div>

      {selectedPedido && (
        <Dialog open={isViewModalOpen} onOpenChange={(isOpen) => {
          setIsViewModalOpen(isOpen);
          if (!isOpen) {
            setSelectedPedido(null); 
            setActiveRevisao(null); 
            setCurrentRevisaoAdminFeedback("");
            setCurrentRevisaoModalStatus(undefined);
            setRevisaoAudioFile(null);
            setModalActiveTab("detalhesPedido"); 
          }
        }}>
          <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl">
            <DialogHeader className="pb-4">
              <DialogTitle className="text-2xl font-bold text-foreground">Detalhes do Pedido: {selectedPedido.id_pedido_serial}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Visualize e gerencie todos os aspectos do pedido, incluindo solicitações de revisão.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={modalActiveTab} onValueChange={setModalActiveTab} className="w-full mt-4">
              <TabsList className="flex w-full rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
                <TabsTrigger
                  value="detalhesPedido"
                  className={`flex-1 h-full px-6 py-3 text-base font-semibold transition-all duration-200 cursor-pointer
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500
                    ${modalActiveTab === 'detalhesPedido'
                      ? 'bg-blue-700 text-white border-b-4 border-blue-400 shadow-lg z-10'
                      : 'bg-gray-800 text-gray-400'}`}
                >
                  Detalhes do Pedido
                </TabsTrigger>
                <TabsTrigger
                  value="gerenciarRevisao" 
                  className={`flex-1 h-full px-6 py-3 text-base font-semibold transition-all duration-200 cursor-pointer
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500
                    ${modalActiveTab === 'gerenciarRevisao'
                      ? 'bg-blue-700 text-white border-b-4 border-blue-400 shadow-lg z-10'
                      : 'bg-gray-800 text-gray-400'}`}
                  disabled={selectedPedido?.status !== 'em_revisao' && !activeRevisao && !loadingRevisao}
                >
                  Revisão Solicitada
                  {selectedPedido?.status === 'em_revisao' && (
                    <Badge variant="destructive" className="ml-2 animate-pulse">!</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Aba 1: Detalhes do Pedido */}
              <TabsContent value="detalhesPedido">
                <div className="space-y-6 py-4 pr-3 overflow-y-auto max-h-[calc(80vh-200px)]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div className="font-medium text-foreground">Cliente:</div>
                <div className="md:col-span-2 text-foreground">{selectedPedido.profile?.full_name || selectedPedido.profile?.username || 'N/A'}</div>
                
                <div className="font-medium text-foreground">Data/Hora:</div>
                <div className="md:col-span-2 text-foreground">
                  {new Date(selectedPedido.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>

                <div className="font-medium text-foreground">Título do Pedido:</div>
                <div className="md:col-span-2 text-foreground">{selectedPedido.titulo || 'N/A'}</div>

                <div className="font-medium text-foreground">Locutor:</div>
                <div className="md:col-span-2 text-foreground">{selectedPedido.locutores?.nome || 'N/A'}</div>

                <div className="font-medium text-foreground">Estilo de Locução:</div>
                <div className="md:col-span-2 text-foreground">{selectedPedido.estilo_locucao || 'N/A'}</div>

                <div className="font-medium text-foreground self-start pt-1">Tipo de Áudio:</div>
                <div className="md:col-span-2">
                  {selectedPedido.tipo_audio ? (
                    <Badge 
                      variant={selectedPedido.tipo_audio === 'off' ? 'secondary' : 'default'}
                      className={cn(
                        "text-sm px-3 py-1 font-semibold",
                        selectedPedido.tipo_audio === 'off' && "bg-amber-100 text-amber-700 border-amber-300",
                        selectedPedido.tipo_audio === 'produzido' && "bg-green-100 text-green-700 border-green-300"
                      )}
                    >
                      {selectedPedido.tipo_audio === 'off' ? 'Áudio em OFF' : 'Áudio Produzido'}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Não especificado</span>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Orientações (Briefing):</h4>
                <div className="p-3 bg-muted/40 rounded-md max-h-32 overflow-y-auto text-sm whitespace-pre-wrap border border-border text-foreground">
                  {selectedPedido.orientacoes || 'Nenhuma orientação fornecida.'}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Roteiro Completo:</h4>
                <div className="p-3 bg-muted/40 rounded-md max-h-40 overflow-y-auto text-sm whitespace-pre-wrap border border-border text-foreground">
                  {selectedPedido.texto_roteiro || 'Nenhum roteiro fornecido.'}
                </div>
              </div>

              {/* Áudio Guia Anexado */}
              {selectedPedido.audio_guia_url && (
                <div className="mt-4">
                  <Label className="text-sm font-medium mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="bg-gradient-to-r from-startt-blue to-startt-purple text-white border-none">Áudio Guia</Badge>
                    <span className="text-muted-foreground">(enviado pelo cliente)</span>
                  </Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-2">
                    <audio
                      controls
                      src={selectedPedido.audio_guia_url}
                      className="w-full max-w-xs bg-neutral-900 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Áudio Guia enviado pelo cliente"
                    >
                      Seu navegador não suporta o elemento de áudio.
                    </audio>
                    <a
                      href={selectedPedido.audio_guia_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-startt-blue to-startt-purple text-white rounded hover:opacity-90 text-xs font-medium transition-colors"
                    >
                      Baixar Áudio Guia
                    </a>
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              {/* SEÇÃO DE COMUNICAÇÃO ADMIN-CLIENTE */}
              {(selectedPedido.admin_message || selectedPedido.cliente_resposta_info) && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-foreground">Comunicação Admin ↔ Cliente:</h4>
                  
                  {/* Mensagem do Admin */}
                  {selectedPedido.admin_message && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border-l-4 border-amber-500">
                      <h5 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Sua Mensagem para o Cliente:
                      </h5>
                      <div className="text-sm text-amber-700 dark:text-amber-200 whitespace-pre-wrap">
                        {selectedPedido.admin_message}
                      </div>
                    </div>
                  )}
                  
                  {/* Resposta do Cliente */}
                  {selectedPedido.cliente_resposta_info && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md border-l-4 border-green-500">
                      <h5 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1 flex items-center">
                        <MessageSquareWarning className="h-4 w-4 mr-2" />
                        Resposta do Cliente:
                        {selectedPedido.data_resposta_cliente && (
                          <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                            ({format(new Date(selectedPedido.data_resposta_cliente), "dd/MM/yy HH:mm", { locale: ptBR })})
                          </span>
                        )}
                      </h5>
                      <div className="text-sm text-green-700 dark:text-green-200 whitespace-pre-wrap">
                        {selectedPedido.cliente_resposta_info}
                      </div>
                      
                      {/* Áudio Anexado pelo Cliente na Resposta */}
                      {selectedPedido.cliente_audio_resposta_url && (
                        <div className="mt-3 p-2 bg-green-100 dark:bg-green-800/30 rounded-md">
                          <h6 className="text-xs font-medium text-green-700 dark:text-green-300 mb-2 flex items-center">
                            <DownloadCloud className="h-3 w-3 mr-1" />
                            Áudio Anexado na Resposta:
                          </h6>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <audio
                              controls
                              src={selectedPedido.cliente_audio_resposta_url}
                              className="w-full max-w-xs bg-neutral-900 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                              aria-label="Áudio anexado pelo cliente na resposta"
                            >
                              Seu navegador não suporta o elemento de áudio.
                            </audio>
                            <a
                              href={selectedPedido.cliente_audio_resposta_url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-xs font-medium transition-colors"
                            >
                              <DownloadCloud className="h-3 w-3 mr-1" />
                              Baixar Áudio
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(selectedPedido.admin_message || selectedPedido.cliente_resposta_info) && <Separator className="my-4" />}

              {/* SEÇÃO DE AÇÕES DO ADMIN */}
              <div className="space-y-6">
                <h4 className="text-lg font-semibold text-foreground border-b pb-2">Ações do Administrador</h4>
                
                {/* Seletor de Status */}
                <div className="space-y-3">
                  <Label htmlFor="status-pedido-principal" className="text-sm font-medium text-foreground">
                    Alterar Status do Pedido:
                  </Label>
                  <Select 
                    value={currentPedidoStatus} 
                    onValueChange={setCurrentPedidoStatus}
                    disabled={selectedPedido.status === 'concluido' || selectedPedido.status === 'cancelado' || isUpdatingPedido}
                  >
                    <SelectTrigger id="status-pedido-principal" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PEDIDO_STATUS.EM_ANALISE}>Em Análise</SelectItem>
                      <SelectItem value={PEDIDO_STATUS.EM_PRODUCAO}>Em Produção</SelectItem>
                      <SelectItem value={PEDIDO_STATUS.GRAVANDO}>Gravando</SelectItem>
                      <SelectItem value={PEDIDO_STATUS.AGUARDANDO_CLIENTE}>Aguardando Cliente</SelectItem>
                      <SelectItem value={PEDIDO_STATUS.CONCLUIDO}>Concluído (requer áudio)</SelectItem>
                      <SelectItem value={PEDIDO_STATUS.CANCELADO}>Cancelar Pedido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* PAINEL CONDICIONAL: AGUARDANDO CLIENTE */}
                {currentPedidoStatus === PEDIDO_STATUS.AGUARDANDO_CLIENTE && (
                  <div className="p-4 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg space-y-3">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      <Label htmlFor="admin-aguardando-cliente-message" className="text-base font-semibold text-amber-800 dark:text-amber-300">
                        Solicitar Informações ao Cliente
                      </Label>
                    </div>
                    <Textarea
                      id="admin-aguardando-cliente-message"
                      placeholder="Ex: O áudio guia está com ruído. Por favor, envie um novo arquivo com mais clareza para continuarmos."
                      value={adminAguardandoClienteMessage}
                      onChange={(e) => setAdminAguardandoClienteMessage(e.target.value)}
                      rows={4}
                      required
                      disabled={isUpdatingPedido}
                      className="bg-white dark:bg-background placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      ⚠️ Esta mensagem é obrigatória e será exibida para o cliente no painel do pedido.
                    </p>
                  </div>
                )}

                {/* PAINEL CONDICIONAL: CANCELAMENTO */}
                {currentPedidoStatus === PEDIDO_STATUS.CANCELADO && (
                  <div className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 rounded-r-lg space-y-3">
                    <div className="flex items-center space-x-2">
                      <MessageSquareWarning className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <Label htmlFor="admin-cancel-reason" className="text-base font-semibold text-red-800 dark:text-red-300">
                        Justificativa do Cancelamento
                      </Label>
                    </div>
                    <Textarea
                      id="admin-cancel-reason"
                      placeholder="Explique detalhadamente o motivo do cancelamento para o cliente..."
                      value={adminCancelReason}
                      onChange={(e) => setAdminCancelReason(e.target.value)}
                      rows={3}
                      required
                      disabled={isUpdatingPedido}
                      className="bg-white dark:bg-background placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      ⚠️ Esta justificativa é obrigatória e será registrada no histórico do pedido.
                    </p>
                  </div>
                )}

                {/* PAINEL CONDICIONAL: UPLOAD DE ÁUDIO */}
                {(currentPedidoStatus === PEDIDO_STATUS.CONCLUIDO || (!currentPedidoStatus || currentPedidoStatus === selectedPedido.status)) && (
                  <div className="space-y-3">
                    <Label htmlFor="audio-file-principal" className="text-sm font-medium text-foreground">
                      Enviar Áudio Finalizado:
                    </Label>
                    <Input 
                      id="audio-file-principal" 
                      type="file" 
                      accept=".mp3,.wav,.ogg,.aac" 
                      onChange={handleFileChange} 
                      className="w-full h-10 px-3 text-foreground placeholder:text-muted-foreground file:bg-gradient-to-r from-startt-blue to-startt-purple file:text-white" 
                      disabled={selectedPedido.status === 'concluido' || selectedPedido.status === 'cancelado' || isUpdatingPedido}
                    />
                    {selectedFile && (
                      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                        <FileAudio className="h-4 w-4" />
                        <span>Arquivo selecionado: {selectedFile.name}</span>
                      </div>
                    )}
                    {selectedPedido.audio_final_url && (
                      <a
                        href={selectedPedido.audio_final_url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 bg-status-green text-white rounded hover:bg-status-green/90 text-xs font-medium transition-colors"
                      >
                        <DownloadCloud className="h-4 w-4 mr-2" /> 
                        Baixar Áudio Atual
                      </a>
                    )}
                    {currentPedidoStatus === PEDIDO_STATUS.CONCLUIDO && !selectedFile && (
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        ⚠️ Um arquivo de áudio é obrigatório para concluir o pedido.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {(selectedPedido.status === 'concluido' || selectedPedido.status === 'cancelado') && (
                <div className="pt-4">
                  <Button 
                    variant="outline"
                    className="w-full border-status-orange text-status-orange hover:bg-status-orange/10 hover:text-status-orange"
                    onClick={handleReopenPedido}
                    disabled={isUpdatingPedido || updateStatusMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reabrir Pedido para Edição
                  </Button>
                </div>
              )}

              {/* Seção de Ações de Risco */}
              <div className="mt-6 border-t pt-6">
                <h4 className="mb-3 text-md font-semibold text-destructive">Ações de Risco</h4>
                <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      className="w-full sm:w-auto"
                      disabled={isUpdatingPedido}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir Pedido e Estornar Créditos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação é irreversível. O pedido ID <span className="font-mono bg-muted px-1 rounded text-foreground font-semibold">{selectedPedido?.id_pedido_serial || selectedPedido?.id.substring(0,8)}</span> será excluído e os créditos ({selectedPedido?.creditos_debitados}) serão estornados ao cliente. Deseja continuar?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isUpdatingPedido}>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeletePedido} disabled={isUpdatingPedido} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        {isUpdatingPedido ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirmar Exclusão
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

                </div> {/* Fim do scrollable-area da Aba 1 */}
              </TabsContent>

              {/* Aba 2: Gerenciar Revisão */}
              <TabsContent value="gerenciarRevisao">
                <div className="space-y-6 py-4 pr-3 overflow-y-auto max-h-[calc(80vh-200px)]">
                  <Card className="bg-card border-none shadow-none">
        <CardHeader>
                      <CardTitle className="text-xl font-bold text-foreground">Gerenciamento da Solicitação de Revisão</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Detalhes e ações para a solicitação de revisão ativa deste pedido.
                      </CardDescription>
        </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingRevisao && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Carregando detalhes da revisão...</span>
            </div>
                      )}
                      {!loadingRevisao && !activeRevisao && selectedPedido?.status !== 'em_revisao' && (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma solicitação de revisão pendente ou ativa encontrada para este pedido.
                        </p>
                      )}
                      {!loadingRevisao && !activeRevisao && selectedPedido?.status === 'em_revisao' && (
                        <p className="text-sm text-orange-600 font-semibold">
                          Este pedido está marcado como "Em Revisão" no sistema principal, mas não foi encontrada uma solicitação de revisão correspondente ativa/pendente nos registros de revisões. 
                          Verifique os dados ou se a solicitação foi processada incorretamente.
                        </p>
                      )}
                      {activeRevisao && (
                        <div className="space-y-6">
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-1">Detalhes da Interação</h4>
                            <div className="p-3 bg-muted/40 rounded-md border border-border text-sm space-y-3 text-foreground">
                              <p><strong>Data da Solicitação Original:</strong> {format(new Date(activeRevisao.data_solicitacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                              <p><strong>Status Atual da Interação:</strong> <Badge variant="outline" className={cn(
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.SOLICITADA && "border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-800",
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE && "border-yellow-500 text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30",
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU && "border-green-500 text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30",
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN && "border-amber-500 text-amber-500 bg-amber-50 dark:bg-blue-900/30",
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.NEGADA && "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/30",
                                activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO && "border-teal-500 text-teal-500 bg-teal-50 dark:bg-teal-900/30"
                                // Adicionar outros status conforme necessário
                               )}>
                                {activeRevisao.status_revisao.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                               </Badge>
                              </p>
                              
                              {/* Pergunta do Admin (se INFO_SOLICITADA_AO_CLIENTE ou CLIENTE_RESPONDEU) */}
                              {(activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE || activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU) && activeRevisao.admin_feedback && (
                                <div className="mt-2">
                                  <p className="mb-0.5 font-medium text-gray-700 dark:text-gray-300">Sua Pergunta/Solicitação ao Cliente:</p>
                                  <div className="p-2 bg-amber-50 dark:bg-blue-900/30 rounded-sm text-xs whitespace-pre-wrap border border-amber-200 dark:border-blue-700 min-h-[40px]">
                                    {activeRevisao.admin_feedback} {/* Corrigido de activeReivado */} 
                                  </div>
                                </div>
                              )}

                              {/* Resposta do Cliente (se CLIENTE_RESPONDEU) */}
                              {activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU && activeRevisao.cliente_resposta_info && (
                                <div className="mt-2">
                                  <p className="mb-0.5 font-medium text-green-700 dark:text-green-300">Resposta do Cliente ({activeRevisao.data_resposta_cliente ? format(new Date(activeRevisao.data_resposta_cliente), "dd/MM/yy HH:mm", {locale: ptBR}) : 'Data N/D'}):</p>
                                  <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-sm text-xs whitespace-pre-wrap border border-green-200 dark:border-green-700 min-h-[40px]">
                                    {activeRevisao.cliente_resposta_info}
                                  </div>
                                </div>
                              )}

                              {/* Descrição Original do Cliente (se for uma solicitação de revisão normal, não uma resposta a info) */}
                              {activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE && 
                               activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU && 
                               activeRevisao.descricao && (
                                <div className="mt-2">
                                  <p className="mb-0.5 font-medium text-gray-700 dark:text-gray-300">Descrição Original do Cliente (para revisão de áudio):</p>
                                  <div className="p-2 bg-muted/40 rounded-sm text-xs whitespace-pre-wrap border border-border min-h-[40px] text-foreground">
                                    {activeRevisao.descricao}
                                  </div>
                                  {activeRevisao.audio_guia_revisao_url && (
                                    <div className="mt-3">
                                      <Label className="text-xs font-medium mb-1 flex items-center gap-2">
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-300">Áudio Guia da Revisão</Badge>
                                        <span className="text-muted-foreground">(enviado pelo cliente para esta revisão)</span>
                                      </Label>
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-2">
                                        <audio
                                          controls
                                          src={activeRevisao.audio_guia_revisao_url}
                                          className="w-full max-w-xs bg-neutral-900 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          aria-label="Áudio Guia da Revisão enviado pelo cliente"
                                        >
                                          Seu navegador não suporta o elemento de áudio.
                                        </audio>
                                        <a
                                          href={activeRevisao.audio_guia_revisao_url}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs font-medium transition-colors"
                                        >
                                          <DownloadCloud className="h-4 w-4 mr-1" /> Baixar Áudio Guia da Revisão
                                        </a>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Formulário de Ação do Admin para a Revisão */}
                          {activeRevisao && 
                           activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO &&
                           activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.NEGADA && (
                            <div className="mt-6 pt-6 border-t bg-card rounded-b-xl">
                              <h4 className="text-md font-semibold text-foreground mb-3">Processar Solicitação de Revisão</h4>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="admin-revisao-acao" className="text-sm font-medium text-foreground">
                                    Ação para esta revisão:
                                  </Label>
                                  <Select
                                    value={currentRevisaoModalStatus}
                                    onValueChange={(value) => setCurrentRevisaoModalStatus(value as TipoRevisaoStatusAdmin)}
                                    disabled={processarRevisaoStatus === 'executing'}
                                  >
                                    <SelectTrigger id="admin-revisao-acao" className="w-full mt-1 bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground">
                                      <SelectValue placeholder="Selecione uma ação..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ADMIN_REVISAO_ACTION_OPTIONS.map(option => (
                                        <SelectItem 
                                          key={option.value} 
                                          value={option.value}
                                          // Desabilitar opções que não fazem sentido com base no status atual da revisão
                                          // Por exemplo, não permitir "Solicitar Info" se o cliente já respondeu à info.
                                          // Ou não permitir "Marcar como em andamento" se já está "Cliente Respondeu".
                                          disabled={
                                            (activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.CLIENTE_RESPONDEU && option.value === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE) ||
                                            (activeRevisao.status_revisao === REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN && option.value === REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN && !currentRevisaoAdminFeedback && !revisaoAudioFile) // Não se já está e nada mudou
                                          }
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {(currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE || 
                                  currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA ||
                                  currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO || // Feedback opcional para áudio finalizado
                                  currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.EM_ANDAMENTO_ADMIN // Feedback opcional para "em andamento"
                                  ) && (
                                  <div>
                                    <Label htmlFor="admin-revisao-feedback" className="text-sm font-medium">
                                      Feedback / Justificativa {
                                        (currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE || currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA) 
                                        ? <span className="text-destructive">*</span> 
                                        : '(Opcional)'
                                      }
                                    </Label>
                                    <Textarea
                                      id="admin-revisao-feedback"
                                      placeholder={
                                        currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE ? "Descreva as informações que o cliente precisa fornecer..." :
                                        currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA ? "Explique o motivo da negação da revisão..." :
                                        "Adicione comentários sobre a revisão ou o novo áudio..."
                                      }
                                      value={currentRevisaoAdminFeedback}
                                      onChange={(e) => setCurrentRevisaoAdminFeedback(e.target.value)}
                                      rows={4}
                                      className="mt-1"
                                      disabled={processarRevisaoStatus === 'executing'} // Corrigido processarReivadoStatus
                                    />
                                     {(currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE || currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA) && (
                                      <p className="text-xs text-muted-foreground mt-1">Este campo é obrigatório para a ação selecionada.</p>
                                    )}
                                  </div>
                                )}

                                {currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO && (
                                  <div>
                                    <Label htmlFor="admin-revisao-audiofile" className="text-sm font-medium">
                                      Novo Áudio Revisado <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                      id="admin-revisao-audiofile"
                                      type="file"
                                      accept=".mp3,.wav,.ogg,.aac"
                                      onChange={handleRevisaoFileChange}
                                      className="w-full mt-1 h-10 px-3 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-500 file:text-white hover:file:bg-amber-500/90"
                                      disabled={processarRevisaoStatus === 'executing'}
                                    />
                                    {revisaoAudioFile && <p className="text-xs text-muted-foreground mt-1">Arquivo selecionado: {revisaoAudioFile.name}</p>}
                                    {!revisaoAudioFile && <p className="text-xs text-muted-foreground mt-1">Um novo arquivo de áudio é obrigatório para finalizar a revisão.</p>}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                        </div> // Fecha o <div className="space-y-6"> de activeRevisao
                      )} {/* Fecha o {activeRevisao && ( */} 
                    </CardContent>
                  </Card>
                </div> {/* Fecha o <div className="space-y-6 py-4 pr-3..."> da aba */}
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="mt-6 pt-6 border-t flex flex-col sm:flex-row sm:justify-end sm:space-x-2 gap-2">
              <DialogClose asChild>
                 <Button variant="outline" disabled={isUpdatingPedido || updateStatusMutation.isPending || processarRevisaoStatus === 'executing' || isProcessingAutoStatusChange}>Cancelar</Button>
              </DialogClose>
              
              {/* Aba Detalhes do Pedido - Botão Salvar Alterações */}
              {showSalvarButtonCondition && (
                <Button 
                  onClick={handleUpdatePedido} 
                  disabled={
                    isUpdatingPedido || 
                    updateStatusMutation.isPending || 
                    isProcessingAutoStatusChange ||
                    (currentPedidoStatus === PEDIDO_STATUS.AGUARDANDO_CLIENTE && !adminAguardandoClienteMessage.trim()) ||
                    (currentPedidoStatus === PEDIDO_STATUS.CANCELADO && !adminCancelReason.trim()) ||
                    (currentPedidoStatus === PEDIDO_STATUS.CONCLUIDO && !selectedFile && !selectedPedido.audio_final_url)
                  }
                >
                  {isUpdatingPedido || updateStatusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 
                  {currentPedidoStatus === PEDIDO_STATUS.AGUARDANDO_CLIENTE ? 'Enviar Mensagem e Pausar Pedido' :
                   currentPedidoStatus === PEDIDO_STATUS.CANCELADO ? 'Cancelar Pedido' :
                   currentPedidoStatus === PEDIDO_STATUS.CONCLUIDO ? 'Concluir Pedido' :
                   'Salvar Alterações'}
                </Button>
              )}
              
              {/* Aba Gerenciar Revisão - Botão de Processar Revisão */}
              {modalActiveTab === 'gerenciarRevisao' && 
               activeRevisao && 
               activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO && 
               activeRevisao.status_revisao !== REVISAO_STATUS_ADMIN.NEGADA && 
               currentRevisaoModalStatus && // Garante que uma ação foi selecionada no formulário
               // A remoção da checagem explícita de !== SOLICITADA para currentRevisaoModalStatus está correta,
               // pois SOLICITADA não é uma opção em ADMIN_REVISAO_ACTION_OPTIONS.
              (
                <Button
                  onClick={() => {
                    if (!currentRevisaoModalStatus) { 
                      toast.error("Ação de revisão não selecionada.");
                      return;
                    }
                    // A verificação explícita contra SOLICITADA foi removida acima, pois não é uma opção selecionável.
                    // A verificação !currentRevisaoModalStatus já cobre o caso de não seleção.

                    if (!activeRevisao?.id) { // Corrigido activeReivado para activeRevisao
                      toast.error("ID da solicitação não encontrado.");
                      return;
                    }
                    if ((currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA || currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE) && !currentRevisaoAdminFeedback.trim()) {
                      toast.error("O campo de feedback/justificativa é obrigatório para esta ação.");
                      return;
                    }
                    if (currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO && !revisaoAudioFile) {
                      toast.error("O novo áudio revisado é obrigatório para finalizar a revisão.");
                      return;
                    }
                    
                    executeProcessarRevisao({
                      solicitacaoId: activeRevisao.id,
                      adminFeedback: currentRevisaoAdminFeedback.trim(),
                      audioFile: currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO ? revisaoAudioFile : null, 
                      novoStatusRevisao: currentRevisaoModalStatus as ActionableRevisaoStatusAdmin, 
                    });
                  }}
                  disabled={
                    processarRevisaoStatus === 'executing' || 
                    !currentRevisaoModalStatus || // Corrigido currentReivadoModalStatus para currentRevisaoModalStatus
                    // Desabilitar se feedback/justificativa obrigatória não preenchida
                    ((currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.NEGADA || currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.INFO_SOLICITADA_AO_CLIENTE) && !currentRevisaoAdminFeedback.trim()) ||
                    // Desabilitar se áudio obrigatório não selecionado
                    (currentRevisaoModalStatus === REVISAO_STATUS_ADMIN.REVISADO_FINALIZADO && !revisaoAudioFile)
                  }
                >
                  {processarRevisaoStatus === 'executing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Processar Revisão
              </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

export default AdminDashboardPage;