import { FastifyInstance } from "fastify";
import { prisma } from "./lib/prisma";
import { z } from "zod";
import dayjs from "dayjs";
export async function appRoutes(app: FastifyInstance) {
  //criação de um novo hábito
  app.post("/habits", async (request) => {
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(z.number().min(0).max(6)),
    });
    const { title, weekDays } = createHabitBody.parse(request.body); //pegando o titulo e o dia da semana da request

    const today = dayjs().startOf("day").toDate(); //zerar as horas

    await prisma.habit.create({
      data: {
        title,
        created_at: today,
        weekDays: {
          create: weekDays.map((weekDay) => {
            return {
              week_day: weekDay,
            };
          }),
        },
      },
    });
  });

  //descobrir os hábitos disponíveis no dia
  app.get("/day", async (request) => {
    const getDayParams = z.object({
      date: z.coerce.date(), //converter o parametro em data
    });
    const { date } = getDayParams.parse(request.query);
    const parseDate = dayjs(date).startOf("day");
    const weekDay = parseDate.get("day");
    console.log("🚀 ~ file: routes.ts:40 ~ app.get ~ weekDay", weekDay);
    console.log(weekDay);
    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        weekDays: {
          some: {
            week_day: weekDay,
          },
        },
      },
    });
    console.log(possibleHabits);
    //habitos que ja foram completados e cadastrados naquele dia
    const day = await prisma.day.findUnique({
      where: {
        date: parseDate.toDate(),
      },
      include: {
        dayHabits: true,
      },
    });
    const completedHabits = day?.dayHabits.map((dayHabit) => {
      return dayHabit.habit_id;
    });
    return {
      possibleHabits,
      completedHabits,
    };
  });

  //completar ou não um hábito
  app.patch("/habits/:id/toogle", async (request) => {
    const toggleHabitParams = z.object({
      id: z.string().uuid(),
    });

    const { id } = toggleHabitParams.parse(request.params);
    const today = dayjs().startOf("day").toDate();

    let day = await prisma.day.findUnique({
      where: {
        date: today,
      },
    });
    if (!day) {
      day = await prisma.day.create({
        data: {
          date: today,
        },
      });
    }
    const dayHabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id: {
          day_id: day.id,
          habit_id: id,
        },
      },
    });

    if (dayHabit) {
      // remover marcacaoo de completo
      await prisma.dayHabit.delete({
        where: {
          id: dayHabit.id,
        },
      });
    } else {
      await prisma.dayHabit.create({
        data: {
          day_id: day.id,
          habit_id: id,
        },
      });
    }
  });

  //meus hábitos
  app.get("/summary", async () => {
    const summary = await prisma.$queryRaw`
  SELECT 
      D.id, 
      D.date,
      (
        SELECT 
          cast(count(*) as float)
        FROM day_habits DH
        WHERE DH.day_id = D.id
      ) as completed,
      (
        SELECT
          cast(count(*) as float)
        FROM week_days HDW
        JOIN habits H
          ON H.id = HDW.habit_id
        WHERE
          HDW.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
          AND H.created_at <= D.date
      ) as amount
    FROM days D
  `;

    return summary;
  });
}
