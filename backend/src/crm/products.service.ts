import { BadRequestException, NotFoundException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** Mahsulot / kurs katalogi — lidga pozitsiya sifatida qo'shiladi. */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return { products: await this.prisma.product.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }) };
  }
  async create(dto: any) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const agg = await this.prisma.product.aggregate({ _max: { order: true } });
    const product = await this.prisma.product.create({
      data: { name: name.slice(0, 200), sku: dto.sku || null, price: price(dto.price), order: (agg._max.order ?? -1) + 1 },
    });
    return { product };
  }
  async update(id: string, dto: any) {
    if (!(await this.prisma.product.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Mahsulot topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = String(dto.name || '').trim();
      if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
      data.name = name.slice(0, 200);
    }
    if (dto.sku !== undefined) data.sku = dto.sku || null;
    if (dto.price !== undefined) data.price = price(dto.price);
    if (dto.active !== undefined) data.active = !!dto.active;
    const product = await this.prisma.product.update({ where: { id }, data });
    return { product };
  }
  async remove(id: string) {
    if (!(await this.prisma.product.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Mahsulot topilmadi' });
    await this.prisma.product.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }
}

// narx: butun, manfiy emas, Int chegarasida
function price(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.min(Math.max(n, 0), 2_000_000_000);
}
