import { BadRequestException, Injectable } from '@nestjs/common';

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
      data: { name, sku: dto.sku || null, price: Number(dto.price) || 0, order: (agg._max.order ?? -1) + 1 },
    });
    return { product };
  }
  async update(id: string, dto: any) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sku !== undefined) data.sku = dto.sku || null;
    if (dto.price !== undefined) data.price = Number(dto.price) || 0;
    if (dto.active !== undefined) data.active = !!dto.active;
    const product = await this.prisma.product.update({ where: { id }, data });
    return { product };
  }
  async remove(id: string) {
    await this.prisma.product.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }
}
