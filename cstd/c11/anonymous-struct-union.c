/* Anonymous structures and unions */

struct value {
	int tag;
	union {
		int i;
		char c;
	};
	struct {
		int x, y;
	};
};

int probe(void)
{
	struct value v;

	v.i = 5;
	v.x = 1;
	v.y = 2;
	return v.i == 5 && v.x + v.y == 3;
}
