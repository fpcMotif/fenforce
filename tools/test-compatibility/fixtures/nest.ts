import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Injectable()
export class WorkspaceLabel {
  value(): string {
    return 'Synthetic workspace';
  }
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly label: WorkspaceLabel) {}
  read(): string {
    return this.label.value();
  }
}

@Entity()
export class CompatibilityRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}
