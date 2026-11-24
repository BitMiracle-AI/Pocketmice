import { cn } from 'cn';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * Rows of values laid out as a table, in a box of the size className gives that scrolls both ways. The first row
 * names the columns, as the first line of a CSV does, and stays in sight. A row has a cell for each value of its
 * own and none for what the widest row has more: the cells are then as many as the values, whatever the rows
 * are like. A long value is shown as far as its column goes, and whole when pointed at.
 */
export function Rows({ rows, className }: { rows: string[][]; className?: string }) {
  const [first = [], ...rest] = rows;

  return (
    // The table is not the one of components/ui, which scrolls sideways in a box of its own: here one box
    // scrolls both ways, so the bar that moves the columns is in sight however many rows there are
    <div className={cn('overflow-auto rounded-xl border', className)}>
      <table className="w-full text-sm">
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            {first.map((value, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the cells of a row are told apart by their position alone
              <TableHead key={column} title={value} className="max-w-96 truncate">
                {value}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rest.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a text are told apart by their position alone
            <TableRow key={index}>
              {row.map((value, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the cells of a row are told apart by their position alone
                <TableCell key={column} title={value} className="max-w-96 truncate">
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}
