export interface ElevenLabsVoice {
  id: string;
  name: string;
  gender: 'female' | 'male';
  country: string;
  tone: string;
  description: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  // 🇧🇷 Brazilian Portuguese
  { id: '33B4UnXyTNbgLmdEDh5P', name: 'Keren', gender: 'female', country: 'Brasil', tone: 'doce', description: 'Jovem brasileira, voz doce e vibrante (Padrão)' },
  { id: 'RGymW84CSmfVugnA5tvA', name: 'Roberta', gender: 'female', country: 'Brasil', tone: 'suave', description: 'Amigável, ideal para conversas' },
  { id: 'GDzHdQOi6jjf8zaXhCYD', name: 'Raquel', gender: 'female', country: 'Brasil', tone: 'expressiva', description: 'Forte e amigável, boa para conversas' },
  { id: 'eVXYtPVYB9wDoz9NVTIy', name: 'Carla', gender: 'female', country: 'Brasil', tone: 'jovem', description: 'Voz jovem para redes sociais' },
  { id: 'OB6x7EbXYlhG4DDTB1XU', name: 'Michelle', gender: 'female', country: 'Brasil', tone: 'doce', description: 'Jovem com voz doce e agradável' },
  { id: 'oi8rgjIfLgJRsQ6rbZh3', name: 'Amanda Kelly', gender: 'female', country: 'Brasil', tone: 'suave', description: 'Feminina, doce, tom neutro' },
  { id: 'MZxV5lN3cv7hi1376O0m', name: 'Ana Dias', gender: 'female', country: 'Brasil', tone: 'profunda', description: 'Voz levemente grave, versátil' },
  { id: 'r2fkFV8WAqXq2AqBpgJT', name: 'Amandoca', gender: 'female', country: 'Brasil', tone: 'divertida', description: 'Comunicativa, boa dicção' },
  { id: 'oJebhZNaPllxk6W0LSBA', name: 'Carla Stories', gender: 'female', country: 'Brasil', tone: 'calorosa', description: 'Voz aveludada, tom profundo' },
  { id: 'lWq4KDY8znfkV0DrK8Vb', name: 'Yasmin Alves', gender: 'female', country: 'Brasil', tone: 'leve', description: 'Tom leve, entrega suave e acolhedora' },
  { id: '7iqXtOF3wl3pomwXFY7G', name: 'Fernanda Agent', gender: 'female', country: 'Brasil', tone: 'profissional', description: 'Profissional para agentes e IVR' },
  { id: 'KHmfNHtEjHhLK9eER20w', name: 'Fernanda Conv.', gender: 'female', country: 'Brasil', tone: 'natural', description: 'Natural e acolhedora, para conversas' },
  { id: 'mPDAoQyGzxBSkE0OAOKw', name: 'Carla VSL', gender: 'female', country: 'Brasil', tone: 'confiante', description: 'Séria e confiante, vendas' },
  { id: 'ohZOfA9iwlZ5nOsoY7LB', name: 'Roberta Sales', gender: 'female', country: 'Brasil', tone: 'casual', description: 'Casual e envolvente, conversões' },
  { id: 'wKWBnOlPYvl4CyUsQPoY', name: 'Li de Sá', gender: 'female', country: 'Brasil', tone: 'séria', description: 'Voz conversacional feminina' },
  { id: 'NQ10OlqJ7vYH6XwegHSW', name: 'Lucke', gender: 'male', country: 'Brasil', tone: 'casual', description: 'Meia-idade, conversacional' },
  { id: 'dX7gRq1dIvLTgUaWpEFn', name: 'Rafael Valente', gender: 'male', country: 'Brasil', tone: 'cativante', description: 'Jovem narrador profissional' },
  { id: 'cFylwQo5ufGYUNyRS167', name: 'Luka', gender: 'male', country: 'Brasil', tone: 'suave', description: 'Jovem, voz suave e agradável' },
  { id: 'CbNfj17erd366KLOAufd', name: 'Guilherme', gender: 'male', country: 'Brasil', tone: 'confiante', description: 'Profundidade e confiança, jovial' },
  { id: 'y3X5crcIDtFawPx7bcNq', name: 'Eliel', gender: 'male', country: 'Brasil', tone: 'profunda', description: 'Grave, épico, audiobooks' },
  { id: 'AaeZyyi87RCxtFnHPS3e', name: 'Prof. Campanholi', gender: 'male', country: 'Brasil', tone: 'didática', description: 'Clara e didática, 40 anos' },
  { id: 'EIkHVdkuarjkYUyMnoes', name: 'Nelton', gender: 'male', country: 'Brasil', tone: 'profunda', description: 'Grave, suave, audiobooks' },
  { id: 'rpNe0HOx7heUulPiOEaG', name: 'Diego', gender: 'male', country: 'Brasil', tone: 'confiante', description: 'Locução para propaganda e comerciais' },
  { id: 'tS45q0QcrDHqHoaWdCDR', name: 'Lax', gender: 'male', country: 'Brasil', tone: 'divertida', description: 'Jovem, engraçado e sarcástico' },
  { id: '9pDzHy2OpOgeXM8SeL0t', name: 'Borges', gender: 'male', country: 'Brasil', tone: 'calma', description: 'Jovem, padrão, audiobooks e jornalismo' },
  { id: '7lu3ze7orhWaNeSPowWx', name: 'Lucas', gender: 'male', country: 'Brasil', tone: 'envolvente', description: 'Redes sociais e YouTube' },
  { id: 'YNOujSUmHtgN6anjqXPf', name: 'Victor Power', gender: 'male', country: 'Brasil', tone: 'sábia', description: 'Meia-idade, ebooks e documentários' },
  { id: 'qPfM2laM0pRL4rrZtBGl', name: 'Sandro Dutra', gender: 'male', country: 'Brasil', tone: 'articulada', description: 'Clara e articulada, amigável' },
  { id: '7u8qsX4HQsSHJ0f8xsQZ', name: 'João Pedro', gender: 'male', country: 'Brasil', tone: 'dinâmica', description: 'Dinâmica, ótima para YouTube' },
  { id: 'bJrNspxJVFovUxNBQ0wh', name: 'Marcelo Costa', gender: 'male', country: 'Brasil', tone: 'agradável', description: 'Meia-idade, narração e storytelling' },
  { id: 'qarDw4DEvUqP3FBlpO0T', name: 'Jon Oliveira', gender: 'male', country: 'Brasil', tone: 'profissional', description: 'Jovem profissional, comerciais' },
  { id: 'Qrdut83w0Cr152Yb4Xn3', name: 'Paulo', gender: 'male', country: 'Brasil', tone: 'profunda', description: 'Grave e informativa' },
  { id: '83Nae6GFQiNslSbuzmE7', name: 'Eduardo Monteiro', gender: 'male', country: 'Brasil', tone: 'regional', description: 'Nordestino, alagoano' },
  { id: '6pQlwCgfwffNdI3jjzM6', name: 'Fernando Borges', gender: 'male', country: 'Brasil', tone: 'calma', description: 'Calma e ressonante, profissional' },
  { id: 'hwnuNyWkl9DjdTFykrN6', name: 'Adriano', gender: 'male', country: 'Brasil', tone: 'profunda', description: 'Grave e masculina, narrador' },
  { id: '5p9IbzcK4R8rN1fpGdMF', name: 'Davi', gender: 'male', country: 'Brasil', tone: 'calorosa', description: 'Amigável e calorosa, conversas' },
  { id: 'eUAnqvLQWNX29twcYLUM', name: 'Dyego', gender: 'male', country: 'Brasil', tone: 'constante', description: 'Notícias e documentários' },
  { id: 'xNGAXaCH8MaasNuo7Hr7', name: 'Beto', gender: 'male', country: 'Brasil', tone: 'profunda', description: 'Nativo SP, profissional e grave' },
  { id: '4r3G9XKliGgVZLKMgjik', name: 'Lair', gender: 'male', country: 'Brasil', tone: 'elegante', description: 'Suave, tom médio-baixo' },
  { id: 'WSBwiRQRmi2mEG7BfKwS', name: 'Yuri', gender: 'male', country: 'Brasil', tone: 'imponente', description: 'Grave e imponente, autoridade' },
  { id: 'ZqE9vIHPcrC35dZv0Svu', name: 'Adam Borges', gender: 'male', country: 'Brasil', tone: 'sensual', description: 'Rica e suave, envolvente' },
  { id: '4za2kOXGgUd57HRSQ1fn', name: 'Lendário', gender: 'male', country: 'Brasil', tone: 'animada', description: 'Meia-idade, redes sociais' },
  { id: 'CstacWqMhJQlnfLPxRG4', name: 'Will BR', gender: 'male', country: 'Brasil', tone: 'calorosa', description: 'Narração infantil brasileira' },
  { id: '7i7dgyCkKt4c16dLtwT3', name: 'David Epic', gender: 'male', country: 'Brasil', tone: 'épica', description: 'Grave, trailers e narrações épicas' },
  { id: 'x6uRgOliu4lpcrqMH3s1', name: 'Flavio Francisco', gender: 'male', country: 'Brasil', tone: 'narrativa', description: 'Narrador profissional brasileiro' },

  // 🇺🇸 American English
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', country: 'EUA', tone: 'profunda', description: 'Meia-idade, voz grave' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', country: 'EUA', tone: 'versátil', description: 'Jovem, bem articulada' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', country: 'EUA', tone: 'clara', description: 'Meia-idade, nítida' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male', country: 'EUA', tone: 'forte', description: 'Americana, documentários' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', country: 'EUA', tone: 'profunda', description: 'Meia-idade, narração' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'male', country: 'EUA', tone: 'rouca', description: 'Meia-idade, video games' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', country: 'EUA', tone: 'casual', description: 'Meia-idade, conversacional' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', gender: 'male', country: 'EUA', tone: 'rouca', description: 'Veterano de guerra, video games' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', gender: 'male', country: 'EUA', tone: 'versátil', description: 'Meia-idade, notícias' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'male', country: 'EUA', tone: 'amigável', description: 'Meia-idade, conversacional' },
  { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', gender: 'male', country: 'EUA', tone: 'suave', description: 'Jovem, ASMR' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: 'male', country: 'EUA', tone: 'ansiosa', description: 'Jovem, video games' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', gender: 'male', country: 'EUA', tone: 'animada', description: 'Americano-irlandês, narração' },
  { id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie', gender: 'male', country: 'EUA', tone: 'rouca', description: 'Idoso, video games' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', country: 'EUA', tone: 'profunda', description: 'Jovem, narração' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', country: 'EUA', tone: 'articulada', description: 'Jovem, narração' },
  { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', gender: 'male', country: 'EUA', tone: 'calma', description: 'Idoso, audiobook' },
  { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick', gender: 'male', country: 'EUA', tone: 'forte', description: 'Meia-idade, video games' },
  { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', gender: 'male', country: 'EUA', tone: 'profissional', description: 'Repórter, notícias' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', country: 'EUA', tone: 'rouca', description: 'Jovem, narração' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', gender: 'male', country: 'EUA', tone: 'calma', description: 'Jovem, meditação' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'male', country: 'EUA', tone: 'amigável', description: 'Profunda e suave' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'female', country: 'EUA', tone: 'natural', description: 'Feminina, expressiva' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', country: 'EUA', tone: 'forte', description: 'Jovem, narração' },
  { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', gender: 'female', country: 'EUA', tone: 'calma', description: 'Jovem, meditação' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', gender: 'female', country: 'EUA', tone: 'versátil', description: 'Jovem americana' },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', gender: 'female', country: 'EUA', tone: 'infantil', description: 'Jovem, animação' },
  { id: 'z9fAnlkpzviPz146aGWa', name: 'Glinda', gender: 'female', country: 'EUA', tone: 'misteriosa', description: 'Meia-idade, video games' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', gender: 'female', country: 'EUA', tone: 'sulista', description: 'Americana sulista, audiobook' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', country: 'EUA', tone: 'expressiva', description: 'Feminina, expressiva' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', country: 'EUA', tone: 'calorosa', description: 'Jovem, audiobook' },
  { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole', gender: 'female', country: 'EUA', tone: 'sussurro', description: 'Jovem, audiobook' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', country: 'EUA', tone: 'calma', description: 'Jovem, narração' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', country: 'EUA', tone: 'suave', description: 'Jovem, notícias' },
  { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena', gender: 'female', country: 'EUA', tone: 'agradável', description: 'Meia-idade, interativa' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', gender: 'male', country: 'EUA', tone: 'suave', description: 'Narração americana' },

  // 🇬🇧 British English
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', country: 'Reino Unido', tone: 'profunda', description: 'Meia-idade, apresentador' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', country: 'Reino Unido', tone: 'rouca', description: 'Meia-idade, narração' },
  { id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph', gender: 'male', country: 'Reino Unido', tone: 'profissional', description: 'Meia-idade, notícias' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', gender: 'male', country: 'Reino Unido', tone: 'conversacional', description: 'Jovem, Essex, video games' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female', country: 'Reino Unido', tone: 'confiante', description: 'Meia-idade, notícias' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', gender: 'female', country: 'Reino Unido', tone: 'agradável', description: 'Jovem, histórias infantis' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', country: 'Reino Unido', tone: 'rouca', description: 'Meia-idade, narração' },

  // 🇦🇺 Australian English
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', country: 'Austrália', tone: 'casual', description: 'Meia-idade, conversacional' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', gender: 'male', country: 'Austrália', tone: 'calma', description: 'Idoso, notícias' },

  // 🇸🇪 Swedish
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', country: 'Suécia', tone: 'sedutora', description: 'Inglesa-sueca, video games' },
  { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi', gender: 'female', country: 'Suécia', tone: 'infantil', description: 'Inglesa-sueca, animação' },

  // 🇮🇪 Irish
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', gender: 'male', country: 'Irlanda', tone: 'rouca', description: 'Idoso, marinheiro' },

  // 🇮🇹 Italian
  { id: 'zcAOhNBS3c14rBihAFp1', name: 'Giovanni', gender: 'male', country: 'Itália', tone: 'expressiva', description: 'Jovem, audiobook' },

  // 🇪🇸 Spanish
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', country: 'Espanha', tone: 'expressiva', description: 'Feminina, expressiva' },
];

// Derive unique filter options
export const VOICE_COUNTRIES = [...new Set(ELEVENLABS_VOICES.map(v => v.country))].sort((a, b) => {
  if (a === 'Brasil') return -1;
  if (b === 'Brasil') return 1;
  return a.localeCompare(b);
});

export const VOICE_GENDERS: { value: ElevenLabsVoice['gender']; label: string }[] = [
  { value: 'female', label: 'Feminina' },
  { value: 'male', label: 'Masculina' },
];

export const VOICE_TONES = [...new Set(ELEVENLABS_VOICES.map(v => v.tone))].sort();

export function filterVoices(
  voices: ElevenLabsVoice[],
  filters: { country?: string; gender?: string; tone?: string; search?: string }
): ElevenLabsVoice[] {
  return voices.filter(v => {
    if (filters.country && v.country !== filters.country) return false;
    if (filters.gender && v.gender !== filters.gender) return false;
    if (filters.tone && v.tone !== filters.tone) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      return v.name.toLowerCase().includes(s) || v.description.toLowerCase().includes(s);
    }
    return true;
  });
}
