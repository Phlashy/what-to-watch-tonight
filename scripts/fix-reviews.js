#!/usr/bin/env node
// One-time script to restore original review text from user's Notes file
// Replaces AI-summarized versions with full original reviews

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const db = new Database(path.join(os.homedir(), 'movie-night-data', 'movies.db'));

const updates = [
  // id 22 - Listers
  { id: 22, notes: `So funny and a great twist - it starts off like it's about them (the filmmakers) but it's partly about the birds and largely about the culture of listing, within bird-watching.` },

  // id 24 - Big Night
  { id: 24, notes: `Ah, it's such a great movie. Moves quickly, great exposition, quirky little gems of acting and a few quotes too. I love it.` },

  // id 48 - Saint Maud
  { id: 48, notes: `This was very disappointing. It has solid reviews, is only 90 mins long, and has religious overtones: it should creep me out. But it was a long one act show. Just building up to something and it's not clear what so that's supposed to be the tension. Very beautifully shot, lovely deep colors and exquisite framing for every shot. Minimal and effective use of angles and so on. Good acting.` },

  // id 55 - Elio
  { id: 55, notes: `Cute movie. Nice acting etc. Boy who is obsessed with aliens and wants to be abducted. It happens. He makes a friend and has to save the day.` },

  // id 56 - The Lion in Winter
  { id: 56, notes: `Wow, what a dull movie. Great acting with a young Anthony Hopkins and Peter O'Toole and Katharine Hepburn. And Timothy Dalton! Playing King Philip of France. Davin loved it though.` },

  // id 57 - Batman Begins
  { id: 57, notes: `Such a solid movie. I love origin stories regardless but this one is great, Liam Neeson leading the 'league of shadows' up on some mountain, flashbacks to the Wayne Sr. murder scene. Christian Bale as Batman, Gary Oldman as Gordon, Morgan Freeman as the scientist making gadgets, Michael Caine as Alfred and Katie Holmes as the love interest. And a young Cillian Murphy as Scarecrow. It's a gas/poison the city plot\u2026 which I thought is what Baine does\u2026 hmm.` },

  // id 61 - The Mastermind
  { id: 61, notes: `Not very similar to her previous stuff that I've seen. Not fast, but not as languid, and no Michelle\u2026 Some very long, boring shots though - him climbing up the ladder, or just doing stuff, and her showing the whole thing. Interesting choice.` },

  // id 63 - Nouvelle Vague
  { id: 63, notes: `Saw with Mitu - fun little tale of the making of Breathless by Jean-Luc Goddard. Quirky and cheeky with great sets, in black and white. Not sure why Linklater would get to tell this story but he did a good job (it's in French).` },

  // id 66 - A Useful Ghost
  { id: 66, notes: `Funny and long movie about ghosts haunting vacuum cleaners in Thailand. And then eventually rising up to massacre a bunch of politicians. Odd. Starts off funny and quirky and then gets political, and then violent in the final scene. The acting was strange - effected and stilted or something.` },

  // id 72 - Spirited Away
  { id: 72, notes: `Ahh, it's so great. Little girl gets stuck in the spirit world trying to free her parents who turned into pigs. Trains running on water. Giant bathhouse for spirits. No face who wants to please her but ends up eating people. There's an element of scariness from the unknown (Davin was scared and Arianne remembers hating the movie) but it ends so sweetly.` },

  // id 82 - Mission Impossible I
  { id: 82, notes: `Fun movie and it's aged pretty well although also so simple and basic compared to the more recent ones. Ving Rhames looks the same but Cruise looks like a baby. Davin enjoyed it.` },

  // id 83 - The Order
  { id: 83, notes: `Jude Law as an FBI agent looking into white supremacist groups in the PNW. Just me and Mitu watching. It was decent but not as good as I was expecting, it had solid reviews etc. Based on a true story.` },

  // id 84 - The Hunt for the Wilderpeople
  { id: 84, notes: `Chubby young kid in foster care moves to a family where things work out, then the mum dies. Sam Neill is the grumpy "uncle". Then it's into the bush and being hunted by an overzealous child protective services woman. Hilarious and everyone agreed it was funny and excellent. :) Davin was jumping up and down at the end. Mitu liked it. Arianne said it was boring at the beginning but came around. A bit of a love letter to New Zealand scenery too. Great performances by a bunch of folks.` },

  // id 85 - Ladybird
  { id: 85, notes: `Took Arianne to VIFF to see this and she said, throughout the movie, "this is me". Which, of course, in this case I agree with completely. So then afterwards she wanted to know why. It's just such a perfect, IMO, capture of a teenage girl. She has her first boyfriend, it doesn't work out. "I respect you too much to touch your boobs." Then her twat of a second boyfriend (Timothee). And then she leaves, and misses her family and Sacramento.` },

  // id 86 - My Left Foot
  { id: 86, notes: `I hadn't actually watched this before. It was just so legendary. The house and the streets are so familiar though, it's not Nana's but it's close to it, and I know those grey cement walls and the lanes. The way he says "don't be frightened Christy, it's your brudda Tom". You definitely forget it's DDL and just see Christy, really amazing. It made me think that it makes sense to stay in character the whole time - what if you lose it? That connection or just the exact voice/thing/everything that you're doing.` },

  // id 87 - My Beautiful Laundrette
  { id: 87, notes: `Charming little movie, I don't quite know what to make of it. It's funny, and so brightly shot that it feels light-hearted and loose. And Omar, the lead, is always just smiling and happy, no matter what he's doing or saying. There's so much explicit tension - racial, economic, political, financial and familial - but the core relationship between Omar and Johnny just is. It was a relief to just have that be there without any commentary or issue etc.` },

  // id 88 - The Godfather
  { id: 88, notes: `Watched with the kids. It actually moves quite fast, I was surprised. Also, so many things I couldn't remember exactly how they worked out until they happened. So odd. In this one he goes to Sicily to hide out after the scene in the restaurant, and gets married etc. But by the end he already has kids. And the whole scene with Sonny at the toll booth happens in this movie too!! What?!\nDavin was very, very upset by the cheating. And Arianne was very, very upset by the misogyny.` },

  // id 91 - Black Bag
  { id: 91, notes: `Em, a little silly, and very light. This was Fassbender and Cate Blanchett as a spy couple that are targeted by her boss (Pierce) because he doesn't like her I guess. It wasn't as smart or tricksy and convoluted as it thought it was. Or the exposition was odd. There was a question for a while "does he suspect her" and "was it her" but it kind of just melts away without any true climax. The denouement? Is that what that is? I'll have to look it up. Anyway, it was pretty and 90 mins long. Their house in London was insane.` },

  // id 100 - Nightbitch
  { id: 100, notes: `I really enjoyed this - I could see how the narration and general position might be annoying if you're not in the mood (commentary on modern motherhood and what is and isn't said) but it's spot on and it's funny and smart so\u2026 what's not actually to love if you listen. They don't go deep into the becoming-a-dog thing either so you don't have to contend with the reality, or not, of that. I was a little confused by the librarian character. Amy Adams was great and they didn't make a caricature of the husband which was smart and must have made things harder for them. Great movie!` },

  // id 465 - Sexy Beast
  { id: 465, notes: `Watching this today I realise I only really had a feeling left over from watching it before. Some images and a very vague recollection of the plot but mostly just a sense of what it was all about. Sunshine, a lot of swearing and the word cunt, and a great pace to it all.\nThe heist is such a small part, I'd assumed it was more. And I'd forgotten the resolution of the main tension!!\nIn general not as good as it was in my mind, but I attribute that to the genius direction having been absorbed into filmmaking generally now. Maybe?` },

  // id 466 - Kneecap
  { id: 466, notes: `So fun and quirky - amazing acting from the band and the apparently Irish Michael Fassbender. Who knew. Short and very sweet with a few laugh out loud moments and hilarious dialogue. Shocking that much of it is true or close enough.` },

  // id 105 - The Quiet Girl
  { id: 105, notes: `Such a sweet slow movie. About a young girl who spends a summer with her mums cousin and gets to see what a house filled with love and care would be like. Emotional ending but otherwise very even keeled and cautious about manipulating our emotions. "Just the facts" so to speak.` },

  // id 109 - Sworn Virgin
  { id: 109, notes: `Funny little movie. In Albanian and Italian - Mark is a trans man but it appears that the transition was more about position and strength in the face of awful levels of misogyny in a mountain community in Albania, once he moves to Italy to reunite with his sister. (After his parents die.) Part of the curiosity being that the community had a way to accommodate folks being trans, despite all their misogyny. This is where the "sworn virgin" comes from. You can be a man, but have to swear to be not sexually active forever after.` },

  // id 110 - You Were Never Really Here
  { id: 110, notes: `Wow. Such a tight movie, we're just thrown right in there. It feels slow somehow with some long, graceful shots ("looking and listening") but the story is moving very quickly. Only 90 mins.\nAmazing sound throughout. (Going back to watching Dept. Q on the plane afterwards was terribly disappointing - why is everyone talking so much, and why are they talking like robots: "I say my lines", "and when you're finished, I say mine while you make a face", pause "so that I can say my lines".)` },

  // id 114 - Perfect Days
  { id: 114, notes: `This was nice. Not what I was expecting. Far less story and the element with his niece is only a small part. Insane 2 minute scene at the end of his face close up with Nina Simone (?) playing on his tape player.` },

  // id 117 - Blue Ruin
  { id: 117, notes: `My 3rd Jeremy Saulnier movie - Green Room and this one on Leigh's recommendation and Rebel Ridge because it was a runaway Netflix hit that Culture Gabfest mentioned (and so good!)\nI liked it. So much acting and so little dialogue. Which is interesting because Green Room had plenty and the back and forth in Rebel Ridge is great. It was quite slow and languid, which I liked, but the payoff wasn't enough, I think - the pace and intensity didn't peak with the conflict so it was all a slow, rolling wave. Or something.\nI'll definitely keep watching out for his next movie though!` },

  // id 124 - The Accountant
  { id: 124, notes: `Such a surprisingly good and different movie. I hadn't realised/remembered until recently (because I read it somewhere) that Ben Affleck's character is on the spectrum. And how great that there is no romantic catharsis, they're just like "nope, that doesn't happen." Oh, and there's a sequel coming out this year, same director.` },

  // id 125 - Conclave
  { id: 125, notes: `I didn't expect to like this. Then Jul said he liked it, and possibly Leigh (?) So I watched it and was thoroughly surprised by how watchable it was. Plot is out there for the context but what a fun and well designed movie. ps. director also made the recent All Quiet\u2026` },

  // id 127 - Creed
  { id: 127, notes: `Arianne insisted we watch this so we finally did. (Again, after I had read that it was actually very good\u2026) It wasn't amazing but definitely good quality. No interest in watching the other movies though! (Director of Black Panther and Sinners.)` },

  // id 130 - Sisu
  { id: 130, notes: `Ridiculous. But fun. Special forces renegade commando in Finnish army wreaks havoc on retreating Nazi's.` },

  // id 111 - Dragonheart
  { id: 111, notes: `Watched this with Davin as Arianne had an assignment. Such a fun movie. I got worried at the beginning that it was more simplistic than I remembered but they really take some time after the setup to make things a bit more involved. Although it feels a bit forced (the knight being angry at the dragon for "ruining" the heart of the king, Einonn). Silly accent from Dennis Quaid but whatever.` },

  // --- Viewings that exist but have empty notes (adding original reviews) ---

  // id 62 - A Bout de Souffle (Breathless)
  { id: 62, notes: `Lol, had to watch this after seeing Nouvelle Vague. It was okay. I didn't really get it, after seeing it. (Unlike Battle of Algiers, which I was able to understand its place in the canon after seeing it, and could see its influence immediately.) Had to read some stuff and watch some videos. So now I kind of get it: it has some technical kudos (jump cuts), and it was a response to both the Americanisation of cinema (making fun of film noir and the notion that you just need "a girl and a gun") and rejecting the French cinema that came before it (but that had already been mostly dethroned by Hollywood). I'm glad I saw it but I don't know if I'll ever watch it again.` },

  // id 65 - The President's Cake
  { id: 65, notes: `Interesting and "Dickensian" tale of a kid in Baghdad trying to get ingredients with no resources. A side of the middle east I have never seen - these little river houses with, essentially, bedouin groups. And everyone had a Saddam mustache!! Enjoyed it.` },

  // id 464 - One Battle After Another
  { id: 464, notes: `Fun movie. I'm not ready to say it's the most awesomest thing in the world yet but\u2026 A bunch of revolutionaries trying to save the US from fascism. Then there's a baby. And then a bad guy military leader comes after them. With some white nationalists thrown in. Sean Penn playing the bad guy. Interestingly and coincidentally Leo's character is watching Battle of Algiers at a pivotal moment and is quoting it as he watches it.` },

  // id 70 - Lion King 1 and 1/2
  { id: 70, notes: `It's really quite funny. Mitu was laughing out loud the whole time. Pumba and Timon tell the story of the lion king from their POV.` },
];

const stmt = db.prepare('UPDATE viewings SET notes = ? WHERE id = ?');

const txn = db.transaction(() => {
  let updated = 0;
  for (const { id, notes } of updates) {
    const result = stmt.run(notes, id);
    if (result.changes > 0) {
      updated++;
    } else {
      console.log(`  WARNING: No viewing found with id ${id}`);
    }
  }
  return updated;
});

const count = txn();
console.log(`Updated ${count} of ${updates.length} reviews.`);
db.close();
