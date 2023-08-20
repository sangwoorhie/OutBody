import {
  ManyToOne,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Challenge } from './challenge.entity';
import { User } from 'src/users/entities/user.entity';

@Entity()
export class Challenger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'int',
    nullable: false,
  })
  challengeId: number;

  @Column({
    type: 'int',
    nullable: false,
  })
  userId: number;

  @Column({
    type: 'string',
    nullable: false,
  })
  authorization: string;

  @Column({
    type: 'boolean',
    nullable: false,
  })
  done: boolean;

  // Challenger => Challenge N:1
  @ManyToOne(() => Challenge, (challenge) => challenge.challenger)
  @JoinColumn({ name: 'challengeId' })
  challenge: Challenge;

  // Challenger => User N:1
  @ManyToOne(() => User, (user) => user.challenger)
  @JoinColumn({ name: 'userId' })
  user: User;
}
