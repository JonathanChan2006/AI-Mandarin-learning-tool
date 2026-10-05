# Test sentences for the chat-turn eval

46 cases. Each one is a tutor line followed by the student's reply.

| id | group | type | source | student wrote | expected |
|---|---|---|---|---|---|
| mw-cat | error | measure_word | textbook | 我有一个猫。 | One mistake. Fix should contain: 一只猫 / 只猫 |
| mw-book | error | measure_word | textbook | 我有三个书。 | One mistake. Fix should contain: 三本书 / 本书 |
| mw-missing | error | measure_word | textbook | 我有两哥哥。 | One mistake. Fix should contain: 两个哥哥 |
| num-liang | error | wrong_word | textbook | 我有二个哥哥。 | One mistake. Fix should contain: 两个哥哥 / 两个 |
| order-time | error | word_order | textbook | 我去学校明天。 | One mistake. Fix should contain: 明天去学校 / 明天我去学校 |
| order-place | error | word_order | textbook | 我吃午饭在家。 | One mistake. Fix should contain: 在家吃午饭 |
| order-ye | error | word_order | textbook | 也我是老师。 | One mistake. Fix should contain: 我也是老师 |
| order-dou | error | word_order | textbook | 都我们是学生。 | One mistake. Fix should contain: 我们都是学生 |
| order-daily | error | word_order | textbook | 我七点起床每天。 | One mistake. Fix should contain: 每天七点起床 |
| neg-mei | error | grammar | textbook | 我不有钱。 | One mistake. Fix should contain: 没有钱 / 没钱 |
| shi-adj | error | grammar | textbook | 她是漂亮。 | One mistake. Fix should contain: 她很漂亮 / 很漂亮 |
| ma-qword | error | grammar | textbook | 你是哪国人吗？ | One mistake. Fix should contain: 你是哪国人 |
| ma-anota | error | grammar | textbook | 你是不是老师吗？ | One mistake. Fix should contain: 你是不是老师 / 你是老师吗 |
| le-future | error | grammar | textbook | 我明天去了商店。 | One mistake. Fix should contain: 明天去商店 / 明天要去商店 / 明天会去商店 |
| bi-hen | error | grammar | textbook | 我比他很高。 | One mistake. Fix should contain: 我比他高 |
| de-missing | error | missing_particle | textbook | 这是我书。 | One mistake. Fix should contain: 我的书 |
| verb-missing | error | grammar | real-log | 我Jonathan。 | One mistake. Fix should contain: 我叫Jonathan / 叫Jonathan / 我是Jonathan |
| wrong-eat | error | wrong_word | textbook | 我喝面包。 | One mistake. Fix should contain: 吃面包 |
| wrong-char | error | spelling | textbook | 不是，我是学声。 | One mistake. Fix should contain: 学生 |
| youdian | error | wrong_word | textbook | 我一点儿累。 | One mistake. Fix should contain: 有点儿累 / 有点累 |
| haishi | error | wrong_word | textbook | 你喝茶或者咖啡？ | One mistake. Fix should contain: 还是咖啡 / 茶还是 |
| ok-cat | correct | hanzi | textbook | 我有一只猫。 | No mistakes: the grader should stay silent |
| ok-tomorrow | correct | hanzi | textbook | 我明天去学校。 | No mistakes: the grader should stay silent |
| ok-nomoney | correct | hanzi | textbook | 我没有钱。 | No mistakes: the grader should stay silent |
| ok-busy | correct | hanzi | textbook | 我今天很忙。 | No mistakes: the grader should stay silent |
| ok-brothers | correct | hanzi | textbook | 我有两个哥哥。 | No mistakes: the grader should stay silent |
| ok-homework | correct | hanzi | real-log | 我现在做功课。 | No mistakes: the grader should stay silent |
| ok-past | correct | hanzi | textbook | 我昨天去了商店。 | No mistakes: the grader should stay silent |
| ok-haishi | correct | hanzi | textbook | 你喝茶还是咖啡？ | No mistakes: the grader should stay silent |
| ok-bi | correct | hanzi | textbook | 我比他高。 | No mistakes: the grader should stay silent |
| ok-longer | correct | hanzi | textbook | 我周末在家看书，也喜欢和朋友吃饭。 | No mistakes: the grader should stay silent |
| ok-english | correct | english | textbook | Sorry, I don't know how to say that yet. | No mistakes: the grader should stay silent |
| ok-mixed | correct | mixed | textbook | 我喜欢喝 coffee。 | No mistakes: the grader should stay silent |
| pinyin-nihao | error | pinyin | real-log | ni hao ma? | One mistake. Fix should contain: 你好吗 |
| pinyin-homework | error | pinyin | real-log | wo xian zai zuo gong ke | One mistake. Fix should contain: 做功课 |
| pinyin-name | error | pinyin | textbook | wo jiao Jonathan | One mistake. Fix should contain: 我叫Jonathan / 叫Jonathan / 我叫 |
| u-shi-hao | error | wording | yours | 我是好。 | One mistake. Fix should contain: 我很好 / 很好 |
| u-from | error | wording | yours | 我是从英国。 | One mistake. Fix should contain: 我是英国人 / 来自英国 / 从英国来 |
| u-renshi | error | wording | yours | 我不知道他。 | One mistake. Fix should contain: 不认识他 / 认识 |
| u-hui | error | wording | yours | 我不可以说中文。 | One mistake. Fix should contain: 不会说中文 / 不会说 |
| u-he | error | wording | yours | 我喜欢猫和我喜欢狗。 | One mistake. Fix should contain: 也喜欢狗 |
| u-zai | error | wrong_character | yours | 我再家。 | One mistake. Fix should contain: 我在家 / 在家 |
| u-ta | error | wrong_character | yours | 他很好。 | One mistake. Fix should contain: 她很好 / 她 |
| u-zuo | error | wrong_character | yours | 我做公共汽车。 | One mistake. Fix should contain: 坐公共汽车 / 坐公交 |
| u-ok-maths | correct | hanzi | yours | 我在大学学数学。 | No mistakes: the grader should stay silent |
| u-ok-chinese | correct | hanzi | yours | 我的中文不太好。 | No mistakes: the grader should stay silent |

## Sentences with one known mistake (32)

### mw-cat

Tutor says:

```
你家有宠物吗？
```

Student replies:

```
我有一个猫。
```

Meaning: I have a cat.

What is wrong: Animals like cats take the measure word 只, not 个.

Counts as caught if a correction contains: 一只猫 / 只猫

Flashcard it should link to: 只


### mw-book

Tutor says:

```
你的书包里有什么？
```

Student replies:

```
我有三个书。
```

Meaning: I have three books.

What is wrong: Books take the measure word 本.

Counts as caught if a correction contains: 三本书 / 本书

Flashcard it should link to: 本


### mw-missing

Tutor says:

```
你有兄弟姐妹吗？
```

Student replies:

```
我有两哥哥。
```

Meaning: I have two older brothers.

What is wrong: A number needs a measure word before the noun: 两个哥哥.

Counts as caught if a correction contains: 两个哥哥

Flashcard it should link to: 个


### num-liang

Tutor says:

```
你有几个哥哥？
```

Student replies:

```
我有二个哥哥。
```

Meaning: I have two older brothers.

What is wrong: Before a measure word, two is 两, not 二.

Counts as caught if a correction contains: 两个哥哥 / 两个

Flashcard it should link to: 两


### order-time

Tutor says:

```
你什么时候去学校？
```

Student replies:

```
我去学校明天。
```

Meaning: I'm going to school tomorrow.

What is wrong: Time words go before the verb: 我明天去学校.

Counts as caught if a correction contains: 明天去学校 / 明天我去学校


### order-place

Tutor says:

```
你在哪儿吃午饭？
```

Student replies:

```
我吃午饭在家。
```

Meaning: I eat lunch at home.

What is wrong: The place phrase goes before the verb: 我在家吃午饭.

Counts as caught if a correction contains: 在家吃午饭


### order-ye

Tutor says:

```
我是老师。你呢？
```

Student replies:

```
也我是老师。
```

Meaning: I'm a teacher too.

What is wrong: 也 goes after the subject: 我也是老师.

Counts as caught if a correction contains: 我也是老师


### order-dou

Tutor says:

```
你们是学生吗？
```

Student replies:

```
都我们是学生。
```

Meaning: We are all students.

What is wrong: 都 goes after the subject: 我们都是学生.

Counts as caught if a correction contains: 我们都是学生


### order-daily

Tutor says:

```
你每天几点起床？
```

Student replies:

```
我七点起床每天。
```

Meaning: I get up at seven every day.

What is wrong: Time words go before the verb: 我每天七点起床.

Counts as caught if a correction contains: 每天七点起床


### neg-mei

Tutor says:

```
你有钱吗？
```

Student replies:

```
我不有钱。
```

Meaning: I don't have money.

What is wrong: 有 is negated with 没, never 不.

Counts as caught if a correction contains: 没有钱 / 没钱

Flashcard it should link to: 没有


### shi-adj

Tutor says:

```
你妹妹怎么样？
```

Student replies:

```
她是漂亮。
```

Meaning: She is pretty.

What is wrong: Adjectives don't take 是; use 很: 她很漂亮.

Counts as caught if a correction contains: 她很漂亮 / 很漂亮


### ma-qword

Tutor says:

```
你想问我什么？
```

Student replies:

```
你是哪国人吗？
```

Meaning: Which country are you from?

What is wrong: A question word already makes it a question; drop 吗.

Counts as caught if a correction contains: 你是哪国人


### ma-anota

Tutor says:

```
你想问我什么？
```

Student replies:

```
你是不是老师吗？
```

Meaning: Are you a teacher?

What is wrong: 是不是 already asks the question; don't add 吗.

Counts as caught if a correction contains: 你是不是老师 / 你是老师吗


### le-future

Tutor says:

```
你明天做什么？
```

Student replies:

```
我明天去了商店。
```

Meaning: I'm going to the shop tomorrow.

What is wrong: 了 marks a completed action, so it can't go with a future plan.

Counts as caught if a correction contains: 明天去商店 / 明天要去商店 / 明天会去商店


### bi-hen

Tutor says:

```
你和你哥哥谁高？
```

Student replies:

```
我比他很高。
```

Meaning: I'm taller than him.

What is wrong: 很 can't be used in a 比 comparison: 我比他高.

Counts as caught if a correction contains: 我比他高


### de-missing

Tutor says:

```
这是谁的书？
```

Student replies:

```
这是我书。
```

Meaning: This is my book.

What is wrong: Possession of a thing needs 的: 我的书.

Counts as caught if a correction contains: 我的书

Flashcard it should link to: 的


### verb-missing

Tutor says:

```
你叫什么名字？
```

Student replies:

```
我Jonathan。
```

Meaning: I'm Jonathan.

What is wrong: The sentence needs a verb: 我叫Jonathan. From your own mistake log.

Counts as caught if a correction contains: 我叫Jonathan / 叫Jonathan / 我是Jonathan

Flashcard it should link to: 叫


### wrong-eat

Tutor says:

```
你早上吃什么？
```

Student replies:

```
我喝面包。
```

Meaning: I eat bread.

What is wrong: Bread is eaten (吃), not drunk (喝).

Counts as caught if a correction contains: 吃面包

Flashcard it should link to: 吃


### wrong-char

Tutor says:

```
你是老师吗？
```

Student replies:

```
不是，我是学声。
```

Meaning: No, I'm a student.

What is wrong: Wrong character: student is 学生, not 学声.

Counts as caught if a correction contains: 学生

Flashcard it should link to: 学生


### youdian

Tutor says:

```
你今天怎么样？
```

Student replies:

```
我一点儿累。
```

Meaning: I'm a bit tired.

What is wrong: Before an adjective, 'a bit' is 有点儿, not 一点儿.

Counts as caught if a correction contains: 有点儿累 / 有点累

Flashcard it should link to: 有点儿


### haishi

Tutor says:

```
你想问我什么？
```

Student replies:

```
你喝茶或者咖啡？
```

Meaning: Do you drink tea or coffee?

What is wrong: 'Or' in a question is 还是; 或者 is for statements.

Counts as caught if a correction contains: 还是咖啡 / 茶还是

Flashcard it should link to: 还是


### pinyin-nihao

Tutor says:

```
你好！
```

Student replies:

```
ni hao ma?
```

Meaning: How are you? Correct Chinese, typed in pinyin without tones. From your log.

What is wrong: Typed in pinyin letters. By your rule that is a mistake: it should be written 你好吗？

Counts as caught if a correction contains: 你好吗


### pinyin-homework

Tutor says:

```
你现在做什么？
```

Student replies:

```
wo xian zai zuo gong ke
```

Meaning: I'm doing homework now. Correct Chinese, typed in pinyin. From your log.

What is wrong: Typed in pinyin letters. By your rule that is a mistake: it should be written 我现在做功课。

Counts as caught if a correction contains: 做功课


### pinyin-name

Tutor says:

```
你叫什么名字？
```

Student replies:

```
wo jiao Jonathan
```

Meaning: My name is Jonathan. Correct Chinese, typed in pinyin.

What is wrong: Typed in pinyin letters. By your rule that is a mistake: it should be written 我叫Jonathan。

Counts as caught if a correction contains: 我叫Jonathan / 叫Jonathan / 我叫


### u-shi-hao

Tutor says:

```
你好吗？
```

Student replies:

```
我是好。
```

Meaning: I am good.

What is wrong: English word order. Adjectives take 很, not 是: 我很好。

Counts as caught if a correction contains: 我很好 / 很好


### u-from

Tutor says:

```
你是哪国人？
```

Student replies:

```
我是从英国。
```

Meaning: I am from England.

What is wrong: Word-for-word from English. Should be 我是英国人。

Counts as caught if a correction contains: 我是英国人 / 来自英国 / 从英国来


### u-renshi

Tutor says:

```
你认识小明吗？
```

Student replies:

```
我不知道他。
```

Meaning: I don't know him.

What is wrong: Wrong 'know'. For people it is 认识: 我不认识他。

Counts as caught if a correction contains: 不认识他 / 认识

Flashcard it should link to: 认识


### u-hui

Tutor says:

```
你会说中文吗？
```

Student replies:

```
我不可以说中文。
```

Meaning: I can't speak Chinese.

What is wrong: Wrong 'can'. 可以 is permission; a learned skill is 会: 我不会说中文。

Counts as caught if a correction contains: 不会说中文 / 不会说

Flashcard it should link to: 会


### u-he

Tutor says:

```
你喜欢什么动物？
```

Student replies:

```
我喜欢猫和我喜欢狗。
```

Meaning: I like cats and I like dogs.

What is wrong: 和 can't join two sentences. Should be 我喜欢猫，也喜欢狗。

Counts as caught if a correction contains: 也喜欢狗


### u-zai

Tutor says:

```
你现在在哪儿？
```

Student replies:

```
我再家。
```

Meaning: I'm at home.

What is wrong: Wrong character with the same sound: 再 should be 在.

Counts as caught if a correction contains: 我在家 / 在家

Flashcard it should link to: 在


### u-ta

Tutor says:

```
你妈妈好吗？
```

Student replies:

```
他很好。
```

Meaning: She's fine.

What is wrong: Wrong character: 他 is 'he'. About your mum it should be 她很好。

Counts as caught if a correction contains: 她很好 / 她

Flashcard it should link to: 她


### u-zuo

Tutor says:

```
你怎么去学校？
```

Student replies:

```
我做公共汽车。
```

Meaning: I take the bus.

What is wrong: Wrong character with the same sound: 做 should be 坐.

Counts as caught if a correction contains: 坐公共汽车 / 坐公交

Flashcard it should link to: 坐


## Correct sentences that must not be flagged (14)

### ok-cat

Tutor says:

```
你家有宠物吗？
```

Student replies:

```
我有一只猫。
```

Meaning: I have a cat.

Expected: no mistakes flagged.


### ok-tomorrow

Tutor says:

```
你什么时候去学校？
```

Student replies:

```
我明天去学校。
```

Meaning: I'm going to school tomorrow.

Expected: no mistakes flagged.


### ok-nomoney

Tutor says:

```
你有钱吗？
```

Student replies:

```
我没有钱。
```

Meaning: I don't have money.

Expected: no mistakes flagged.


### ok-busy

Tutor says:

```
你今天忙吗？
```

Student replies:

```
我今天很忙。
```

Meaning: I'm busy today.

Expected: no mistakes flagged.


### ok-brothers

Tutor says:

```
你有几个哥哥？
```

Student replies:

```
我有两个哥哥。
```

Meaning: I have two older brothers.

Expected: no mistakes flagged.


### ok-homework

Tutor says:

```
你现在做什么？
```

Student replies:

```
我现在做功课。
```

Meaning: I'm doing homework now.

Expected: no mistakes flagged.

Note: From your log, in characters. The grader once told you to add 在 here; the sentence is fine without it.


### ok-past

Tutor says:

```
你昨天做什么了？
```

Student replies:

```
我昨天去了商店。
```

Meaning: I went to the shop yesterday.

Expected: no mistakes flagged.


### ok-haishi

Tutor says:

```
你想问我什么？
```

Student replies:

```
你喝茶还是咖啡？
```

Meaning: Do you drink tea or coffee?

Expected: no mistakes flagged.


### ok-bi

Tutor says:

```
你和你哥哥谁高？
```

Student replies:

```
我比他高。
```

Meaning: I'm taller than him.

Expected: no mistakes flagged.


### ok-longer

Tutor says:

```
你周末做什么？
```

Student replies:

```
我周末在家看书，也喜欢和朋友吃饭。
```

Meaning: At weekends I read at home, and I also like eating with friends.

Expected: no mistakes flagged.


### ok-english

Tutor says:

```
你喜欢吃什么？
```

Student replies:

```
Sorry, I don't know how to say that yet.
```

Meaning: (English only, so there is no Chinese to correct.)

Expected: no mistakes flagged.


### ok-mixed

Tutor says:

```
你喜欢喝什么？
```

Student replies:

```
我喜欢喝 coffee。
```

Meaning: I like drinking coffee. (The Chinese part is correct; the English word is not an error.)

Expected: no mistakes flagged.


### u-ok-maths

Tutor says:

```
你学什么？
```

Student replies:

```
我在大学学数学。
```

Meaning: I study maths at university.

Expected: no mistakes flagged.


### u-ok-chinese

Tutor says:

```
你的中文怎么样？
```

Student replies:

```
我的中文不太好。
```

Meaning: My Chinese isn't very good.

Expected: no mistakes flagged.

