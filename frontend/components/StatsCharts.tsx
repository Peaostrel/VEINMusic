'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const PlatformDistribution = ({ data }: { data: any }) => {
    const chartData = Object.entries(data).map(([name, value]) => ({
        name: name === 'spotify' ? 'Spotify' : name === 'yandex' ? 'Яндекс' : name === 'vk' ? 'VK' : name === 'youtube_music' ? 'YouTube' : name === 'soundcloud' ? 'SoundCloud' : name === 'apple_music' ? 'Apple' : name,
        value: Number(value),
        color: name === 'spotify' ? '#1DB954' : name === 'yandex' ? '#ffcc00' : name === 'vk' ? '#0077FF' : name === 'youtube_music' ? '#FF0000' : name === 'soundcloud' ? '#FF5500' : name === 'apple_music' ? '#FA243C' : '#888888'
    })).sort((a, b) => b.value - a.value);

    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export const GenreCloud = ({ data }: { data: any }) => {
    const sortedGenres = Object.entries(data)
        .map(([name, value]) => ({ name, value: Number(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);

    if (sortedGenres.length === 0) return <div className="text-gray-500 text-center py-10">Нет данных о жанрах</div>;

    const maxVal = sortedGenres[0].value;

    return (
        <div className="flex flex-wrap justify-center gap-3 p-4">
            {sortedGenres.map((g, i) => {
                const fontSize = Math.max(0.8, (g.value / maxVal) * 2) + 'rem';
                const opacity = Math.max(0.4, (g.value / maxVal));
                return (
                    <span 
                        key={i} 
                        className="font-black transition-all hover:scale-110 hover:text-[var(--accent)] cursor-default"
                        style={{ fontSize, opacity, color: i === 0 ? 'var(--accent)' : 'inherit' }}
                    >
                        {g.name}
                    </span>
                );
            })}
        </div>
    );
};

export const ActivityBarChart = ({ data, color = 'var(--accent)' }: { data: any, color?: string }) => {
    const chartData = Object.entries(data).map(([name, value]) => ({ name, value: Number(value) }));

    return (
        <div className="h-48 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    />
                    <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
