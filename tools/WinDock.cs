using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class WinDock
{
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int idx);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLong(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    const int SW_RESTORE = 9;

    public struct RECT { public int Left, Top, Right, Bottom; }

    const int GWL_HWNDPARENT = -8;
    const int GWL_STYLE = -16;
    const long WS_CHILD = 0x40000000L;
    const long WS_POPUP = 0x80000000L;
    const long WS_CAPTION = 0x00C00000L;
    const long WS_THICKFRAME = 0x00040000L;
    const long WS_SYSMENU = 0x00080000L;
    const long WS_MINIMIZEBOX = 0x00020000L;
    const long WS_MAXIMIZEBOX = 0x00010000L;
    const uint SWP_FRAMECHANGED = 0x0020;
    const uint SWP_NOZORDER = 0x0004;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint SWP_SHOWWINDOW = 0x0040;
    const int SM_CXVIRTUALSCREEN = 78;
    const int SM_CYVIRTUALSCREEN = 79;

    static string exeName = null;

    static IntPtr SetOwner(IntPtr hWnd, IntPtr owner)
    {
        if (IntPtr.Size == 8) return SetWindowLongPtr(hWnd, GWL_HWNDPARENT, owner);
        return SetWindowLong(hWnd, GWL_HWNDPARENT, owner);
    }

    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr h, int flags, StringBuilder buf, ref int size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    static readonly System.Collections.Generic.Dictionary<uint, bool> matchCache = new System.Collections.Generic.Dictionary<uint, bool>();

    static bool ProcMatches(uint pid)
    {
        if (exeName == null) return true;
        bool cached;
        if (matchCache.TryGetValue(pid, out cached)) return cached;
        bool ok = false;
        try
        {
            IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h != IntPtr.Zero)
            {
                var sb = new StringBuilder(1024);
                int size = sb.Capacity;
                if (QueryFullProcessImageNameW(h, 0, sb, ref size))
                {
                    string full = sb.ToString();
                    string baseName = full.Substring(full.LastIndexOf('\\') + 1).ToLowerInvariant();
                    string want = exeName.ToLowerInvariant();
                    if (!want.EndsWith(".exe")) want += ".exe";
                    ok = baseName == want;
                }
                CloseHandle(h);
            }
        }
        catch { ok = false; }
        matchCache[pid] = ok;
        return ok;
    }

    // 只认「像正经应用窗口」的：可见、顶层、有标题、尺寸合理、落在屏幕范围内
    static bool LooksLikeAppWindow(IntPtr h)
    {
        if (!IsWindowVisible(h)) return false;
        if (GetParent(h) != IntPtr.Zero) return false;
        if (GetWindowTextLength(h) <= 0) return false;
        RECT r;
        if (!GetWindowRect(h, out r)) return false;
        int w = r.Right - r.Left, hh = r.Bottom - r.Top;
        if (w < 260 || hh < 160) return false;
        int sw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        int sh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if (sw <= 0) sw = 1920;
        if (sh <= 0) sh = 1080;
        if (r.Left < -sw || r.Top < -sh) return false;              // 屏幕外（隐藏窗口惯用 -25600）
        if (r.Left > sw * 2 || r.Top > sh * 2) return false;
        return true;
    }

    static IntPtr FindWindow(uint pid)
    {
        IntPtr bestSane = IntPtr.Zero;
        int bestArea = -1;
        IntPtr bestAny = IntPtr.Zero;
        int bestLen = -1;
        EnumProc cb = delegate(IntPtr h, IntPtr p)
        {
            uint wp;
            GetWindowThreadProcessId(h, out wp);
            if (exeName == null ? (wp != pid) : !ProcMatches(wp)) return true;
            if (!IsWindowVisible(h)) return true;
            if (GetParent(h) != IntPtr.Zero) return true;
            int len = GetWindowTextLength(h);
            if (len <= 0) return true;
            RECT r;
            if (GetWindowRect(h, out r))
            {
                int w = r.Right - r.Left, hh = r.Bottom - r.Top;
                long st = GetStyle(h).ToInt64();
                bool frame = (st & WS_THICKFRAME) != 0;
                bool sane = w >= 400 && hh >= 300 && r.Left > -8000 && r.Top > -8000;
                if (sane && frame)
                {
                    int area = w * hh;
                    if (area > bestArea) { bestArea = area; bestSane = h; }
                }
            }
            if (len > bestLen) { bestLen = len; bestAny = h; }
            return true;
        };
        EnumWindows(cb, IntPtr.Zero);
        GC.KeepAlive(cb);
        return bestSane != IntPtr.Zero ? bestSane : bestAny;
    }

    static IntPtr GetStyle(IntPtr h)
    {
        return IntPtr.Size == 8 ? GetWindowLongPtr(h, GWL_STYLE) : GetWindowLong(h, GWL_STYLE);
    }

    static void SetStyle(IntPtr h, long style)
    {
        if (IntPtr.Size == 8) SetWindowLongPtr(h, GWL_STYLE, new IntPtr(style));
        else SetWindowLong(h, GWL_STYLE, new IntPtr((int)style));
    }

    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
    public struct POINT { public int X, Y; }
    const int SW_SHOW = 5;

    static void Seat(IntPtr child, int x, int y, int w, int h)
    {
        SetWindowPos(child, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    // 返回 true 表示恰好贴住了；false 表示程序自己把窗口挪走/藏了
    static bool Embed(IntPtr child, IntPtr parent, int x, int y, int w, int h)
    {
        long st = GetStyle(child).ToInt64();
        st = (st & ~WS_POPUP) | WS_CHILD;
        SetStyle(child, st);
        SetParent(child, parent);
        SetWindowPos(child, IntPtr.Zero, x, y, w, h, SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        ShowWindow(child, SW_SHOW);

        // 目标座位（屏幕坐标）
        POINT o = new POINT();
        ClientToScreen(parent, ref o);
        RECT want;
        want.Left = o.X + x; want.Top = o.Y + y;
        want.Right = want.Left + w; want.Bottom = want.Top + h;

        // 有些程序（Electron/JVM）嵌入后会自己挪走或隐藏，再贴几次
        int fixedCount = 0;
        for (int i = 0; i < 12; i++)
        {
            System.Threading.Thread.Sleep(250);
            RECT now;
            if (!GetWindowRect(child, out now)) return false;
            bool sameRect = Math.Abs(now.Left - want.Left) <= 2 && Math.Abs(now.Top - want.Top) <= 2
                            && Math.Abs((now.Right - now.Left) - w) <= 2 && Math.Abs((now.Bottom - now.Top) - h) <= 2;
            bool shown = IsWindowVisible(child);
            if (sameRect && shown) { if (i >= 3) break; continue; }
            ShowWindow(child, SW_SHOW);
            Seat(child, x, y, w, h);
            fixedCount++;
        }

        RECT fin;
        GetWindowRect(child, out fin);
        bool ok = Math.Abs(fin.Left - want.Left) <= 4 && Math.Abs(fin.Top - want.Top) <= 4 && IsWindowVisible(child);
        Console.WriteLine((ok ? "OK embed " : "WARN embed ") + child.ToInt64()
            + " fixes=" + fixedCount
            + " rect=" + fin.Left + "," + fin.Top + " " + (fin.Right - fin.Left) + "x" + (fin.Bottom - fin.Top));
        return ok;
    }

    static void Unembed(IntPtr child, int x, int y, int w, int h)
    {
        long st = GetStyle(child).ToInt64();
        st = (st & ~WS_CHILD) | WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
        SetStyle(child, st);
        SetParent(child, IntPtr.Zero);
        SetWindowPos(child, IntPtr.Zero, x, y, w, h, SWP_FRAMECHANGED | SWP_NOZORDER | SWP_SHOWWINDOW);
    }

    static int Main(string[] args)
    {
        long pid = 0, owner = 0, hwnd = 0;
        int x = int.MinValue, y = int.MinValue, w = 0, h = 0;
        bool find = false, undock = false, probe = false, embed = false, seatOnly = false;

        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            string v = (i + 1 < args.Length) ? args[i + 1] : "";
            switch (a)
            {
                case "--pid": pid = ParseNum(v); i++; break;
                case "--owner": owner = ParseNum(v); i++; break;
                case "--hwnd": hwnd = ParseNum(v); i++; break;
                case "--x": x = (int)ParseNum(v); i++; break;
                case "--y": y = (int)ParseNum(v); i++; break;
                case "--w": w = (int)ParseNum(v); i++; break;
                case "--h": h = (int)ParseNum(v); i++; break;
                case "--exe": exeName = v; i++; break;
                case "--find": find = true; break;
                case "--undock": undock = true; break;
                case "--embed": embed = true; break;
                case "--probe": probe = true; break;
                case "--seat": seatOnly = true; break;
            }
        }

        IntPtr hw = hwnd != 0 ? new IntPtr(hwnd) : FindWindow((uint)pid);
        if (hw == IntPtr.Zero) { Console.WriteLine("ERR no-window"); return 2; }

        if (find) { Console.WriteLine("HWND " + hw.ToInt64()); return 0; }

        if (probe)
        {
            RECT rr;
            if (!GetWindowRect(hw, out rr)) { Console.WriteLine("ERR no-rect"); return 3; }
            Console.WriteLine("RECT " + rr.Left + " " + rr.Top + " " + (rr.Right - rr.Left) + " " + (rr.Bottom - rr.Top));
            return 0;
        }

        if (seatOnly)
        {
            ShowWindow(hw, SW_SHOW);
            Seat(hw, x == int.MinValue ? 0 : x, y == int.MinValue ? 0 : y, w, h);
            Console.WriteLine("OK seat " + hw.ToInt64());
            return 0;
        }

        if (embed)
        {
            if (owner == 0) { Console.WriteLine("ERR need-owner"); return 4; }
            bool seated = Embed(hw, new IntPtr(owner), x == int.MinValue ? 0 : x, y == int.MinValue ? 0 : y, w, h);
            return seated ? 0 : 5;
        }

        if (undock)
        {
            if (GetParent(hw) != IntPtr.Zero)
            {
                Unembed(hw, 200, 140, 1200, 820);
                Console.WriteLine("OK unembed " + hw.ToInt64());
                return 0;
            }
            SetOwner(hw, IntPtr.Zero);
            SetWindowPos(hw, IntPtr.Zero, 200, 140, 1200, 820, SWP_NOZORDER | SWP_SHOWWINDOW);
            SetForegroundWindow(hw);
            Console.WriteLine("OK undock " + hw.ToInt64());
            return 0;
        }

        ShowWindow(hw, SW_RESTORE);
        if (owner != 0) SetOwner(hw, new IntPtr(owner));
        if (x != int.MinValue && y != int.MinValue && w > 0 && h > 0)
        {
            SetWindowPos(hw, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
        Console.WriteLine("OK dock " + hw.ToInt64());
        return 0;
    }

    static long ParseNum(string s)
    {
        if (string.IsNullOrEmpty(s)) return 0;
        s = s.Trim();
        if (s.StartsWith("0x") || s.StartsWith("0X")) return Convert.ToInt64(s.Substring(2), 16);
        long r;
        long.TryParse(s, out r);
        return r;
    }
}