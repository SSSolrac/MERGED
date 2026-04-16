export const DailyMenuPreview = ({ menuDate, isPublished, items }: { menuDate: string; isPublished: boolean; items: string[] }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-medium">Current Menu of the Day</h3>
        <p className="text-sm text-[#6B7280]">Date: {menuDate}</p>
      </div>
      <span className={`text-xs px-2 py-1 rounded ${isPublished ? 'bg-green-100 text-green-700' : 'bg-[#FFE4E8] text-slate-700'}`}>
        {isPublished ? 'Published' : 'Not published'}
      </span>
    </div>

    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="border rounded p-3">
          <p className="font-medium">{item}</p>
        </div>
      ))}
    </div>
  </section>
);
