export type ColunaTipo = 'texto' | 'moeda' | 'bool'
export type ColunaMD = { campo: string; label: string; tipo?: ColunaTipo }
export type EntidadeMD = {
  key: string
  label: string
  table: string
  buscaCampo: string
  colunas: ColunaMD[]
  novoHref?: string
  editarHrefBase?: string // href = `${base}/${id}`
  editarHrefFixo?: string // href fixo (sem id)
}

export const ENTIDADES: EntidadeMD[] = [
  {
    key: 'clientes', label: 'Clientes', table: 'clientes', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cnpj', label: 'CNPJ' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/clientes/novo', editarHrefBase: '/receitas/clientes',
  },
  {
    key: 'contratos', label: 'Contratos', table: 'contratos', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'ticket', label: 'Ticket', tipo: 'moeda' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/contratos/novo', editarHrefBase: '/receitas/contratos',
  },
  {
    key: 'projetos', label: 'Projetos', table: 'projetos', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'valor_total', label: 'Valor', tipo: 'moeda' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/projetos/novo', editarHrefBase: '/receitas/projetos',
  },
  {
    key: 'fornecedores', label: 'Fornecedores', table: 'fornecedores', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cnpj', label: 'CNPJ' }, { campo: 'ativo', label: 'Ativo', tipo: 'bool' }],
    novoHref: '/despesas/fornecedores/novo', editarHrefBase: '/despesas/fornecedores',
  },
  {
    key: 'funcionarios', label: 'Funcionários', table: 'funcionarios', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cargo', label: 'Cargo' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'salario_base', label: 'Salário', tipo: 'moeda' }],
    novoHref: '/folha/funcionarios/novo', editarHrefBase: '/folha/funcionarios',
  },
  {
    key: 'pj_spot', label: 'PJ Spot', table: 'pj_spot', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'especialidade', label: 'Especialidade' }, { campo: 'ativo', label: 'Ativo', tipo: 'bool' }],
    novoHref: '/folha/pj-spot/novo', editarHrefBase: '/folha/pj-spot',
  },
  {
    key: 'categorias', label: 'Categorias', table: 'categorias', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'ativa', label: 'Ativa', tipo: 'bool' }],
  },
  {
    key: 'contas_bancarias', label: 'Contas Bancárias', table: 'contas_bancarias', buscaCampo: 'banco',
    colunas: [{ campo: 'banco', label: 'Banco' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'saldo_atual', label: 'Saldo', tipo: 'moeda' }, { campo: 'ativa', label: 'Ativa', tipo: 'bool' }],
    novoHref: '/config/contas-bancarias', editarHrefFixo: '/config/contas-bancarias',
  },
]

export function getEntidade(key: string): EntidadeMD | undefined {
  return ENTIDADES.find((e) => e.key === key)
}
