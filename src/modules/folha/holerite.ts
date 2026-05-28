import 'server-only'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServiceClient } from '@/lib/supabase/service'
import type { ItemFolha } from '@/lib/schemas/folha'
import type { Funcionario } from '@/lib/schemas/funcionario'

/**
 * Generate a basic holerite PDF and upload to Supabase Storage.
 * Returns the storage path on success.
 *
 * The PDF is minimal (compliant CLT layout — empresa identification, funcionario,
 * mes/ano, eventos/descontos table, totals). For more elaborate layouts, swap in
 * a richer template later — interface (item + funcionario → bytes) stays stable.
 */
export async function gerarHoleritePDF(
  item: ItemFolha,
  funcionario: Funcionario,
  mesRef: string,
  organizacaoNome: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])  // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const draw = (text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    page.drawText(text, {
      x, y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(opts.color[0]!, opts.color[1]!, opts.color[2]!) : rgb(0, 0, 0),
    })
  }

  let y = 800
  draw(organizacaoNome, 40, y, { size: 14, bold: true }); y -= 25
  draw(`RECIBO DE PAGAMENTO ${formatMes(mesRef)}`, 40, y, { size: 12, bold: true }); y -= 30

  draw(`Funcionário: ${funcionario.nome}`, 40, y); y -= 14
  if (funcionario.cpf) { draw(`CPF: ${funcionario.cpf}`, 40, y); y -= 14 }
  draw(`Cargo: ${funcionario.cargo}`, 40, y); y -= 14
  draw(`Admissão: ${funcionario.data_admissao}`, 40, y); y -= 20

  // Eventos
  draw('EVENTOS', 40, y, { bold: true }); draw('VALOR (R$)', 450, y, { bold: true }); y -= 14
  draw('Salário base', 40, y); draw(formatBRL(item.salario_bruto), 450, y); y -= 14
  if (item.beneficios_valor > 0) {
    draw('Benefícios', 40, y); draw(formatBRL(item.beneficios_valor), 450, y); y -= 14
  }
  y -= 6

  // Descontos
  draw('DESCONTOS', 40, y, { bold: true }); draw('VALOR (R$)', 450, y, { bold: true }); y -= 14
  draw('INSS', 40, y); draw(`- ${formatBRL(item.inss_funcionario)}`, 450, y, { color: [0.7, 0, 0] }); y -= 14
  if (item.irrf > 0) {
    draw('IRRF', 40, y); draw(`- ${formatBRL(item.irrf)}`, 450, y, { color: [0.7, 0, 0] }); y -= 14
  }
  y -= 10

  draw('LÍQUIDO A RECEBER', 40, y, { bold: true })
  draw(formatBRL(item.liquido_pagar), 450, y, { bold: true }); y -= 30

  // Encargos do empregador (informativo)
  draw('Encargos do empregador (não descontados):', 40, y, { size: 8 }); y -= 12
  draw(`FGTS: ${formatBRL(item.fgts)} · INSS Patronal: ${formatBRL(item.inss_patronal)} · Provisões: ${formatBRL(item.provisao_13 + item.provisao_ferias)}`, 40, y, { size: 8 })

  return pdf.save()
}

export async function uploadHolerite(
  itemId: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const admin = createServiceClient()
  const path = `holerites/${itemId}.pdf`
  const { error } = await admin.storage
    .from('holerites')
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`uploadHolerite: ${error.message}`)

  await admin.from('holerites').upsert({ item_folha_id: itemId, storage_path: path })
  return path
}

function formatMes(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]} / ${parts[0]}`
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
