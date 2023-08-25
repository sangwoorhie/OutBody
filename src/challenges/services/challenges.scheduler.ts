import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Between, DataSource, LessThanOrEqual } from 'typeorm';
import { ChallengesRepository } from '../repositories/challenges.repository';
import { ChallengersRepository } from '../repositories/challengers.repository';
import { UserRepository } from 'src/users/repositories/users.repository';
import { Challenge } from '../entities/challenge.entity';
import { Challenger } from '../entities/challenger.entity';
import { User } from 'src/users/entities/user.entity';
import { GoalsRepository } from '../repositories/goals.repository';
import { RecordsRepository } from 'src/records/repositories/records.repository';
import { PostsRepository } from 'src/posts/repositories/posts.repository';

@Injectable()
export class ChallengeScheduler {
  constructor(
    private readonly logger: Logger,
    private dataSource: DataSource,
    private readonly challengesRepository: ChallengesRepository,
    private readonly challengersRepository: ChallengersRepository,
    private readonly userRepository: UserRepository,
    private readonly goalRepository: GoalsRepository,
    private readonly recordRepository: RecordsRepository,
    private readonly postRepository: PostsRepository,
  ) {}

  // 도전 시작일이 경과하는 시점에서 참가자가 단 1명일 경우, 도전 자동 삭제
  @Cron(CronExpression.EVERY_HOUR)
  async automaticDelete() {
    await this.challengesRepository.automaticDeleteChallenge();
  }

  // 도전 종료시 점수 자동분배
  @Cron(CronExpression.EVERY_HOUR)
  async pointDistribute(): Promise<any> {
    const challengesToDistribute = await this.challengesRepository.find({
      where: {
        endDate: LessThanOrEqual(new Date()),
        isDistributed: false,
      },
    });

    for (const challenge of challengesToDistribute) {
      const entryPoint = challenge.entryPoint;

      const users = await this.challengersRepository.getChallengers(
        challenge.id,
      );

      const succeedUsers: Challenger[] = users.filter(
        (user) => user.done === true,
      );
      const failedUsers: Challenger[] = users.filter(
        (user) => user.done === false,
      );

      const challengerCount =
        await this.challengersRepository.getChallengerCount(challenge.id);
      const totalPoint = challenge.entryPoint * challengerCount;

      const challengers = await this.challengersRepository.getChallengers(
        challenge.id,
      );

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        await queryRunner.startTransaction();
        // 모두 성공한 경우
        if (users.length === succeedUsers.length) {
          for (const challenger of challengers) {
            const user = await this.userRepository.getUserById(
              challenger.userId,
            );

            const beforeUserPoint: number = user.point;
            let afterUserPoint: number;

            const succeedUserIds = succeedUsers.map(
              (succeedUser) => succeedUser.id,
            );

            if (succeedUserIds.includes(challenger.id)) {
              afterUserPoint = beforeUserPoint + entryPoint;
            }

            await queryRunner.manager.update(
              User,
              { id: user.id },
              { point: afterUserPoint },
            );
            await queryRunner.manager.update(
              Challenge,
              { id: challenge.id },
              { isDistributed: true },
            );
          }
          // 일부만 성공한 경우
        } else {
          for (const challenger of challengers) {
            const user = await this.userRepository.getUserById(
              challenger.userId,
            );

            const beforeUserPoint: number = user.point;
            let afterUserPoint: number;

            const succeedUserIds = succeedUsers.map(
              (succeedUser) => succeedUser.id,
            );
            const failedUserIds = failedUsers.map(
              (failedUser) => failedUser.id,
            );

            if (succeedUserIds.includes(challenger.id)) {
              afterUserPoint =
                beforeUserPoint + Math.floor(totalPoint / succeedUsers.length);
            } else if (failedUserIds.includes(challenger.id)) {
              afterUserPoint = beforeUserPoint - entryPoint;
            }

            await queryRunner.manager.update(
              User,
              { id: user.id },
              { point: afterUserPoint },
            );
            await queryRunner.manager.update(
              Challenge,
              { id: challenge.id },
              { isDistributed: true },
            );
          }
        }
        await queryRunner.commitTransaction();

        this.logger.debug(
          `${challenge.id}번 도전이 종료되어, 점수가 정상적으로 배분되었습니다.`,
        );
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  }

  // @Cron(CronExpression.EVERY_MINUTE)
  // async outbodyCron() {
  //   await this.recordRepository.bodyStatusRecord();
  // }

  // 도전 종료 시 성공여부 (Challenger done 컬럼 true 로 변환여부) 체크 및 변환
  @Cron(CronExpression.EVERY_SECOND)
  async goalComplete() {
    const challenges = await this.challengesRepository.find({
      where: {
        endDate: LessThanOrEqual(new Date('2023-08-24')),
        isDistributed: false,
      },
    });
    console.log(challenges);
    for (const challenge of challenges) {
      const challengers = await this.challengersRepository.getChallengers(
        challenge.id,
      );
      const startDate = new Date(challenge.startDate);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(challenge.endDate);

      const { weight, fat, muscle, attend } = await this.goalRepository.findOne(
        {
          where: { challengeId: challenge.id },
        },
      );

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        for (const challenger of challengers) {
          await queryRunner.startTransaction();
          const posts = await this.postRepository.find({
            where: { createdAt: Between(startDate, endDate) },
          });
          const record = await this.recordRepository.findOne({
            where: { userId: challenger.userId },
            order: { createdAt: 'DESC' },
          });

          if (
            // posts.length >= attend &&
            (record.fat <= fat || fat === null) &&
            (record.muscle >= muscle || muscle === null) &&
            (record.weight <= weight || weight === null)
          ) {
            await queryRunner.manager.update(
              Challenger,
              { userId: challenger.userId },
              { done: true },
            );

            this.logger.debug('Challenger 정보가 갱신되었습니다.');
            await queryRunner.commitTransaction();
          }
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw new NotImplementedException('요청작업이 실패했습니다.');
      }
    }
  }
}
