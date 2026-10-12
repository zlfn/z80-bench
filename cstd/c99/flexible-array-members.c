/* Flexible array members */

struct list {
	int n;
	int item[];
};

static union {
	struct list list;
	int words[4];
} u;

int probe(void)
{
	u.list.n = 2;
	u.list.item[0] = 5;
	u.list.item[1] = 7;
	return sizeof(struct list) >= sizeof(int) && u.words[2] == 7;
}
