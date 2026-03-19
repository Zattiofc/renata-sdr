import React, { useState, useMemo } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ELEVENLABS_VOICES,
  VOICE_COUNTRIES,
  VOICE_GENDERS,
  VOICE_TONES,
  filterVoices,
} from '@/constants/elevenlabs-voices';

interface VoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
  variant?: 'default' | 'dark';
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  value,
  onChange,
  variant = 'default',
}) => {
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<string>('');
  const [toneFilter, setToneFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredVoices = useMemo(
    () =>
      filterVoices(ELEVENLABS_VOICES, {
        country: countryFilter || undefined,
        gender: genderFilter || undefined,
        tone: toneFilter || undefined,
        search: searchQuery || undefined,
      }),
    [countryFilter, genderFilter, toneFilter, searchQuery]
  );

  const selectedVoice = ELEVENLABS_VOICES.find(v => v.id === value);
  const hasFilters = countryFilter || genderFilter || toneFilter || searchQuery;

  // Available tones based on current country/gender filters
  const availableTones = useMemo(() => {
    const filtered = filterVoices(ELEVENLABS_VOICES, {
      country: countryFilter || undefined,
      gender: genderFilter || undefined,
    });
    return [...new Set(filtered.map(v => v.tone))].sort();
  }, [countryFilter, genderFilter]);

  const isDark = variant === 'dark';
  const selectTriggerClass = isDark
    ? 'bg-slate-800/50 border-slate-700 text-white h-8 text-xs'
    : 'bg-background border-border text-foreground h-8 text-xs';
  const selectContentClass = isDark
    ? 'bg-slate-800 border-slate-700 z-50'
    : 'bg-popover border-border z-50';
  const selectItemClass = isDark
    ? 'text-white hover:bg-violet-500/20 focus:bg-violet-500/20 focus:text-white text-xs'
    : 'text-foreground text-xs';
  const inputClass = isDark
    ? 'bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-8 text-xs'
    : 'bg-background border-border text-foreground h-8 text-xs';
  const labelClass = isDark ? 'text-slate-500' : 'text-muted-foreground';
  const badgeClass = isDark
    ? 'text-violet-400 bg-violet-500/10 border-violet-500/30'
    : 'text-primary bg-primary/10 border-primary/30';

  return (
    <div className="space-y-3">
      {/* Filters Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`} />

        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className={`${selectTriggerClass} w-[120px]`}>
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="all" className={selectItemClass}>Todos os países</SelectItem>
            {VOICE_COUNTRIES.map(c => (
              <SelectItem key={c} value={c} className={selectItemClass}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className={`${selectTriggerClass} w-[110px]`}>
            <SelectValue placeholder="Gênero" />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="all" className={selectItemClass}>Todos</SelectItem>
            {VOICE_GENDERS.map(g => (
              <SelectItem key={g.value} value={g.value} className={selectItemClass}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={toneFilter} onValueChange={setToneFilter}>
          <SelectTrigger className={`${selectTriggerClass} w-[120px]`}>
            <SelectValue placeholder="Tom" />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="all" className={selectItemClass}>Todos os tons</SelectItem>
            {availableTones.map(t => (
              <SelectItem key={t} value={t} className={selectItemClass}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[120px]">
          <Search className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar voz..."
            className={`${inputClass} pl-7`}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setCountryFilter('');
              setGenderFilter('');
              setToneFilter('');
              setSearchQuery('');
            }}
            className={`h-8 px-2 rounded border text-xs flex items-center gap-1 hover:opacity-80 transition-opacity ${isDark ? 'border-slate-700 text-slate-400' : 'border-border text-muted-foreground'}`}
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}
      </div>

      {/* Voice Select */}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : 'bg-background border-border text-foreground'}>
          <SelectValue placeholder="Selecione uma voz">
            {selectedVoice ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">{selectedVoice.name}</span>
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-muted-foreground'}`}>
                  {selectedVoice.country} · {selectedVoice.gender === 'female' ? '♀' : '♂'} · {selectedVoice.tone}
                </span>
              </span>
            ) : 'Selecione uma voz'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={`${selectContentClass} max-h-[280px]`}>
          {filteredVoices.length === 0 ? (
            <div className={`p-3 text-center text-xs ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`}>
              Nenhuma voz encontrada com estes filtros
            </div>
          ) : (
            filteredVoices.map(voice => (
              <SelectItem key={voice.id} value={voice.id} className={selectItemClass}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{voice.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeClass}`}>
                    {voice.country}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`}>
                    {voice.gender === 'female' ? '♀' : '♂'} · {voice.tone}
                  </span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Counter */}
      {hasFilters && (
        <p className={`text-[10px] ${labelClass}`}>
          {filteredVoices.length} de {ELEVENLABS_VOICES.length} vozes
        </p>
      )}
    </div>
  );
};
